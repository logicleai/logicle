/**
 * Builds a self-contained offline replay bundle from a source Logicle database.
 *
 * The bundle is a single SQLite file for one conversation: the app schema, plus the selected
 * `Conversation` / `Message` / `MessageAudit` / `Assistant*` / `Backend` / `File` / `FileBlob` /
 * `FileAnalysis` / `AssistantVersionFile` rows, plus a `ReplayFileBlob(path, size, bytes)` table
 * holding every referenced attachment and assistant-knowledge file (and extracted-text sidecar),
 * **decrypted**. Configured assistant-tool presence is recorded in `ReplayMetadata`; tool
 * execution is an optimizer/replay decision, not a bundle-building decision.
 * `eval-replay-production-chats.ts` consumes it with zero network access.
 *
 * This script is infra-agnostic. It reads the source database via `--source-db` (or `DATABASE_URL`)
 * and file bytes via the normal storage stack (`FILE_STORAGE_LOCATION` plus the
 * `FILE_STORAGE_ENCRYPTION_*` vars, only needed when the conversation or assistant has files).
 * `FILE_STORAGE_LOCATION` may be an `s3://` bucket, a directory, or an `http(s)://` read-only
 * proxy (`HttpReadOnlyStorage`) — wiring any of those to a specific tenant is the job of the ops
 * repo's `download_replay_bundle`, not this script.
 *
 * Usage:
 *   FILE_STORAGE_LOCATION=s3://tenant-bucket FILE_STORAGE_ENCRYPTION_ENABLE=1 \
 *   FILE_STORAGE_ENCRYPTION_KEY=... \
 *   npx tsx apps/backend/scripts/eval-build-replay-bundle.ts \
 *     --source-db postgres://... --out bundle.sqlite <conversation-id>
 *
 * Flags:
 *   --source-db <path|url>     source SQLite path or DATABASE_URL (default: $DATABASE_URL)
 *   --out <path>               bundle SQLite file to write (required); <out>.skipped.json is also written
 *   <conversation-id>          conversation to replay (required positional argument)
 *
 * The builder does not choose a replay target. It saves the complete conversation; the replay
 * runner chooses one audited user message, defaulting to the latest one with a saved response.
 */

import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Kysely, Migrator, SqliteDialect, sql } from 'kysely'
import type { DB } from '@/db/schema'

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const usage =
  'Usage: --source-db <path|url> (or $DATABASE_URL) --out <bundle.sqlite> <conversation-id>'
const args = process.argv.slice(2).filter((arg) => arg !== '--')
let sourceDb = process.env.DATABASE_URL
let out: string | undefined
const positionals: string[] = []
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg === '--source-db' || arg === '--out') {
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      console.error(`${arg} requires a value\n${usage}`)
      process.exit(1)
    }
    if (arg === '--source-db') sourceDb = value
    else out = value
    index += 1
  } else if (arg.startsWith('--')) {
    console.error(`Unknown option: ${arg}\n${usage}`)
    process.exit(1)
  } else {
    positionals.push(arg)
  }
}

const conversationId = positionals[0]
if (!sourceDb || !out || !conversationId || positionals.length !== 1) {
  console.error(usage)
  process.exit(1)
}

// The app db/storage singletons must bind to the source. Set this before importing them.
process.env.DATABASE_URL = sourceDb.includes('://') ? sourceDb : `file://${sourceDb}`

const { db: source } = await import('@/db/database')
const { dtoMessageFromDbMessage } = await import('@/models/utils')
const { collectAttachmentFileIds } = await import('@/backend/lib/eval/productionChatReplay')
const { migrationModules } = await import('@/db/migrations.generated')

// Remove any stale bundle so the schema is rebuilt cleanly, then open it as a second connection.
rmSync(out, { force: true })
const BetterSqlite = (await import('better-sqlite3')).default
const bundle = new Kysely<DB>({
  dialect: new SqliteDialect({ database: new BetterSqlite(out) }),
})

const migrator = new Migrator({
  db: bundle,
  provider: {
    getMigrations: async () =>
      Object.fromEntries(
        Object.entries(migrationModules).map(([key, value]) => [
          key,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { up: async (d: Kysely<any>) => value.up(d, 'sqlite') },
        ])
      ),
  },
})
const migration = await migrator.migrateToLatest()
if (migration.error) {
  console.error(`Failed to build bundle schema: ${errText(migration.error)}`)
  process.exit(1)
}
// The bundle is a deliberately partial database copy (one conversation, files re-owned), so
// foreign-key enforcement would reject references outside that conversation. A migration leaves
// this connection with keys on; turn it back off for the copy phase.
await sql`PRAGMA foreign_keys = OFF`.execute(bundle)
await sql`
  CREATE TABLE IF NOT EXISTS "ReplayFileBlob" (
    "path" TEXT PRIMARY KEY NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BLOB NOT NULL
  )
`.execute(bundle)
await sql`
  CREATE TABLE IF NOT EXISTS "ReplayMetadata" (
    "key" TEXT PRIMARY KEY NOT NULL,
    "value" TEXT NOT NULL
  )
`.execute(bundle)

const REPLAY_OWNER = 'production-replay-user'
const seenBlobPaths = new Set<string>()
const seenBlobIds = new Set<string>()

const copyBlobBytes = async (blobPath: string, encryption: 'pgp' | 'aead' | null, size: number) => {
  if (seenBlobPaths.has(blobPath)) return
  const { storage } = await import('@/lib/storage')
  const bytes = await storage.readBuffer(blobPath, encryption)
  await sql`
    INSERT INTO "ReplayFileBlob" ("path", "size", "bytes")
    VALUES (${blobPath}, ${size || bytes.byteLength}, ${bytes})
  `.execute(bundle)
  seenBlobPaths.add(blobPath)
}

let copied:
  | {
      messages: number
      audits: number
      attachments: number
      knowledgeFiles: number
      configuredTools: number
      replayableTargets: number
    }
  | undefined
let failure: string | undefined
try {
  const conversation = await source
    .selectFrom('Conversation')
    .selectAll()
    .where('id', '=', conversationId)
    .executeTakeFirst()
  if (!conversation) throw new Error(`Conversation ${conversationId} does not exist`)

  const messages = await source
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .execute()
  if (messages.length === 0) throw new Error(`Conversation ${conversationId} has no messages`)

  const audits = await source
    .selectFrom('MessageAudit')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .execute()

  const assistant = await source
    .selectFrom('Assistant')
    .innerJoin('AssistantVersion', 'AssistantVersion.id', 'Assistant.publishedVersionId')
    .select([
      'Assistant.id as assistantId',
      'Assistant.owner as assistantOwner',
      'Assistant.provisioned as assistantProvisioned',
      'Assistant.deleted as assistantDeleted',
      'Assistant.hidden as assistantHidden',
      'AssistantVersion.id as versionId',
      'AssistantVersion.backendId as backendId',
      'AssistantVersion.subAssistants as subAssistants',
    ])
    .where('Assistant.id', '=', conversation.assistantId)
    .executeTakeFirst()
  if (!assistant) throw new Error('Assistant or its published version is unavailable')
  if (assistant.assistantDeleted !== 0) throw new Error('Assistant is deleted')

  const subAssistants = assistant.subAssistants
    ? (JSON.parse(String(assistant.subAssistants)) as unknown[])
    : []
  if (Array.isArray(subAssistants) && subAssistants.length > 0) {
    throw new Error('Assistant has sub-assistants, which the offline replay cannot reconstruct')
  }
  const configuredTools = await source
    .selectFrom('AssistantVersionToolAssociation')
    .select('toolId')
    .where('assistantVersionId', '=', assistant.versionId)
    .execute()
  await sql`
    INSERT OR REPLACE INTO "ReplayMetadata" ("key", "value")
    VALUES ('configuredTools', ${JSON.stringify({ count: configuredTools.length })})
  `.execute(bundle)
  const knowledgeAssociations = await source
    .selectFrom('AssistantVersionFile')
    .selectAll()
    .where('assistantVersionId', '=', assistant.versionId)
    .execute()

  let replayMessages: ReturnType<typeof dtoMessageFromDbMessage>[]
  try {
    replayMessages = messages.map(dtoMessageFromDbMessage)
  } catch (error) {
    throw new Error(`A saved message cannot be converted: ${errText(error)}`)
  }

  // Resolve every attachment and assistant-knowledge file before writing relational rows. A file
  // may appear in both sets; bundle it once and preserve the assistant association separately.
  const attachmentFileIds = collectAttachmentFileIds(replayMessages)
  const knowledgeFileIds = knowledgeAssociations.map((association) => association.fileId)
  const knowledgeFileIdSet = new Set(knowledgeFileIds)
  const referencedFileIds = [...new Set([...attachmentFileIds, ...knowledgeFileIds])]
  const fileRows: Array<{
    file: {
      id: string
      name: string
      path: string
      type: string
      origin: 'uploaded' | 'generated' | null
      createdAt: string
      fileBlobId: string | null
    }
    blob: {
      id: string
      contentHash: string
      path: string
      type: string
      size: number
      encryption: 'pgp' | 'aead' | null
      createdAt: string
    } | null
    analysis: {
      fileId: string
      kind: string
      status: string
      payload: string | null
      error: string | null
      createdAt: string
      updatedAt: string
    } | null
  }> = []
  for (const fileId of referencedFileIds) {
    const kind = knowledgeFileIdSet.has(fileId) ? 'Knowledge file' : 'Attachment'
    const fileRow = await source
      .selectFrom('File')
      .select(['id', 'name', 'path', 'type', 'origin', 'createdAt', 'fileBlobId'])
      .where('id', '=', fileId)
      .executeTakeFirst()
    if (!fileRow) {
      throw new Error(`${kind} ${fileId} has no File row`)
    }
    const blobRow = fileRow.fileBlobId
      ? await source
          .selectFrom('FileBlob')
          .select(['id', 'contentHash', 'path', 'type', 'size', 'encryption', 'createdAt'])
          .where('id', '=', fileRow.fileBlobId)
          .executeTakeFirst()
      : undefined
    if (fileRow.fileBlobId && !blobRow) {
      throw new Error(`${kind} ${fileId} FileBlob ${fileRow.fileBlobId} is missing`)
    }
    // Production's cached file analysis (extracted PDF/office text) — carry it so the replay
    // reuses it instead of re-analyzing (which would fail on the read-only replay storage and,
    // worse, change the prompt: without extracted text a PDF is sent natively, inflating tokens
    // past what production actually paid).
    const analysisRow = await source
      .selectFrom('FileAnalysis')
      .select(['fileId', 'kind', 'status', 'payload', 'error', 'createdAt', 'updatedAt'])
      .where('fileId', '=', fileId)
      .executeTakeFirst()
    let extractedTextPath: string | undefined
    if (analysisRow?.status === 'ready' && analysisRow.payload) {
      try {
        const parsed = JSON.parse(analysisRow.payload) as { extractedTextPath?: string | null }
        extractedTextPath = parsed.extractedTextPath ?? undefined
      } catch {
        /* leave analysis without a sidecar; it will just re-analyze */
      }
    }
    if (blobRow) {
      try {
        await copyBlobBytes(blobRow.path, blobRow.encryption, blobRow.size)
      } catch (error) {
        throw new Error(
          `${kind} ${fileId} blob ${blobRow.path} could not be read: ${errText(error)}`
        )
      }
    }
    if (extractedTextPath) {
      try {
        await copyBlobBytes(extractedTextPath, blobRow?.encryption ?? null, 0)
      } catch (error) {
        throw new Error(
          `${kind} ${fileId} extracted-text sidecar ${extractedTextPath} could not be read: ${errText(
            error
          )}`
        )
      }
    }
    fileRows.push({ file: fileRow, blob: blobRow ?? null, analysis: analysisRow ?? null })
  }

  const backend = await source
    .selectFrom('Backend')
    .selectAll()
    .where('id', '=', assistant.backendId)
    .executeTakeFirstOrThrow()
  const version = await source
    .selectFrom('AssistantVersion')
    .selectAll()
    .where('id', '=', assistant.versionId)
    .executeTakeFirstOrThrow()
  let backendEndpoint: string | undefined
  try {
    const configuration = JSON.parse(backend.configuration) as { endPoint?: unknown }
    if (typeof configuration.endPoint === 'string') backendEndpoint = configuration.endPoint
  } catch {
    // The replay still gets provider/model identity from the relational columns. An invalid source
    // configuration should not make the bundle retain opaque values that may contain credentials.
  }
  await bundle
    .insertInto('Backend')
    .values({
      ...backend,
      configuration: JSON.stringify(backendEndpoint ? { endPoint: backendEndpoint } : {}),
    })
    .execute()
  await bundle
    .insertInto('AssistantVersion')
    .values({ ...version, imageId: null })
    .execute()
  await bundle
    .insertInto('Assistant')
    .values({
      id: assistant.assistantId,
      owner: assistant.assistantOwner,
      provisioned: assistant.assistantProvisioned,
      deleted: assistant.assistantDeleted,
      hidden: assistant.assistantHidden,
      publishedVersionId: assistant.versionId,
      draftVersionId: null,
    })
    .execute()
  await bundle.insertInto('Conversation').values(conversation).execute()

  for (const row of messages) await bundle.insertInto('Message').values(row).execute()
  for (const audit of audits) await bundle.insertInto('MessageAudit').values(audit).execute()

  for (const { file, blob, analysis } of fileRows) {
    if (blob && !seenBlobIds.has(blob.id)) {
      await bundle
        .insertInto('FileBlob')
        .values({
          id: blob.id,
          contentHash: blob.contentHash,
          path: blob.path,
          type: blob.type,
          size: blob.size,
          encryption: null,
          createdAt: blob.createdAt,
        })
        .execute()
      seenBlobIds.add(blob.id)
    }
    await bundle
      .insertInto('File')
      .values({
        id: file.id,
        name: file.name,
        path: file.path,
        type: file.type,
        origin: file.origin ?? 'uploaded',
        size: blob?.size ?? 0,
        uploaded: blob ? 1 : 0,
        createdAt: file.createdAt,
        encrypted: 0,
        fileBlobId: blob?.id ?? null,
        ownerType: 'USER',
        ownerId: REPLAY_OWNER,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .execute()
    if (analysis) {
      await bundle
        .insertInto('FileAnalysis')
        .values({
          fileId: analysis.fileId,
          kind: analysis.kind,
          status: analysis.status,
          // Bump past any analyzer version the replay checkout might expect, so it is reused
          // verbatim and never re-run.
          analyzerVersion: 2_000_000_000,
          payload: analysis.payload,
          error: analysis.error,
          createdAt: analysis.createdAt,
          updatedAt: analysis.updatedAt,
        })
        .execute()
    }
  }
  for (const association of knowledgeAssociations) {
    await bundle.insertInto('AssistantVersionFile').values(association).execute()
  }

  const messageIds = new Set(messages.map((message) => message.id))
  const replayableTargets = audits.filter(
    (audit) =>
      audit.type === 'user' &&
      audit.errors === null &&
      messages.some(
        (message) =>
          messageIds.has(audit.messageId) &&
          message.parent === audit.messageId &&
          message.role === 'assistant'
      )
  ).length
  copied = {
    messages: messages.length,
    audits: audits.length,
    attachments: attachmentFileIds.length,
    knowledgeFiles: knowledgeFileIds.length,
    configuredTools: configuredTools.length,
    replayableTargets,
  }
} catch (error) {
  failure = errText(error)
} finally {
  await source.destroy()
  await bundle.destroy()
}

await writeFile(
  `${out}.skipped.json`,
  JSON.stringify(failure ? [{ conversationId, reason: failure }] : [], null, 2),
  'utf-8'
)
if (failure || !copied) {
  console.error(
    `Could not build ${out}: ${failure ?? 'unknown error'}. Details: ${out}.skipped.json.`
  )
  process.exitCode = 1
} else {
  console.error(
    `Wrote conversation ${conversationId} to ${out}: ${copied.messages} messages, ` +
      `${copied.audits} audits, ${copied.attachments} attachments, ` +
      `${copied.knowledgeFiles} assistant knowledge files, ` +
      `${copied.configuredTools} configured assistant tools recorded, ` +
      `${copied.replayableTargets} candidate replay messages.`
  )
}
