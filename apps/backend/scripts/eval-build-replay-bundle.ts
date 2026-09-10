/**
 * Builds a self-contained offline replay bundle from a source Logicle database.
 *
 * The bundle is a single SQLite file: the app schema, plus only the selected conversations'
 * `Conversation` / `Message` / `MessageAudit` / `Assistant*` / `Backend` / `File` / `FileBlob` /
 * `FileAnalysis` rows, plus a `ReplayFileBlob(path, size, bytes)` table holding every referenced
 * attachment's bytes and its extracted-text sidecar, **decrypted**.
 * `eval-replay-production-chats.ts` consumes it with zero network access.
 *
 * This script is infra-agnostic. It reads the source database via `--source-db` (or `DATABASE_URL`)
 * and attachment bytes via the normal storage stack (`FILE_STORAGE_LOCATION` plus the
 * `FILE_STORAGE_ENCRYPTION_*` vars, only needed when a selected turn has attachments).
 * `FILE_STORAGE_LOCATION` may be an `s3://` bucket, a directory, or an `http(s)://` read-only
 * proxy (`HttpReadOnlyStorage`) — wiring any of those to a specific tenant is the job of the ops
 * repo's `download_replay_bundle`, not this script.
 *
 * Usage:
 *   FILE_STORAGE_LOCATION=s3://tenant-bucket FILE_STORAGE_ENCRYPTION_ENABLE=1 \
 *   FILE_STORAGE_ENCRYPTION_KEY=... \
 *   npx tsx apps/backend/scripts/eval-build-replay-bundle.ts \
 *     --source-db postgres://... --out bundle.sqlite --min-input-tokens 12000 --limit 25
 *
 * Flags:
 *   --source-db <path|url>     source SQLite path or DATABASE_URL (default: $DATABASE_URL)
 *   --out <path>               bundle SQLite file to write (required); <out>.skipped.json is also written
 *   --min-input-tokens <n>     MessageAudit input-token floor (default: 12000)
 *   --limit <n>                admitted turns (default: 20)
 *   --assistant <id>           restrict to one assistant
 *   --distinct-conversations   admit at most one turn per conversation
 *   --since <ISO date>         only turns sent on/after this date (default: 90 days ago)
 *
 * Only turns that can be replayed faithfully are considered: the assistant still exists, is not
 * tool/knowledge/sub-assistant configured, still runs the model the turn actually used, and the
 * turn did not error in production.
 */

export {}

import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Kysely, Migrator, SqliteDialect, sql } from 'kysely'
import type { DB, Message as DbMessage } from '@/db/schema'

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}

const sourceDb = flag('source-db') ?? process.env.DATABASE_URL
const out = flag('out')
if (!sourceDb || !out) {
  console.error('Usage: --source-db <path|url> (or $DATABASE_URL) --out <bundle.sqlite>')
  process.exit(1)
}

const minimumAuditedInputTokens = Number(flag('min-input-tokens') ?? 12000)
const limit = Number(flag('limit') ?? 20)
const assistantFilter = flag('assistant')
const distinctConversations = args.includes('--distinct-conversations')
if (!Number.isFinite(minimumAuditedInputTokens) || minimumAuditedInputTokens < 1) {
  console.error('--min-input-tokens must be a positive number')
  process.exit(1)
}
if (!Number.isInteger(limit) || limit < 1) {
  console.error('--limit must be a positive integer')
  process.exit(1)
}
// Replay is only faithful for turns whose assistant is still configured the way it was then.
// Default to the last 90 days; pass `--since 1970-01-01` to disable.
const sinceIso = flag('since') ?? new Date(Date.now() - 90 * 86_400_000).toISOString()
if (Number.isNaN(Date.parse(sinceIso))) {
  console.error('--since must be an ISO date')
  process.exit(1)
}

// The app db/storage singletons must bind to the source. Set this before importing them.
process.env.DATABASE_URL = sourceDb.includes('://') ? sourceDb : `file://${sourceDb}`

const { db: source } = await import('@/db/database')
const { dtoMessageFromDbMessage } = await import('@/models/utils')
const { renderMessagePlainText } = await import('@/backend/lib/chat/message-projection')
const { isReplayableLineage, collectAttachmentFileIds } = await import(
  '@/backend/lib/eval/productionChatReplay'
)
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
// The bundle is a deliberately partial copy (one lineage per conversation, files re-owned), so
// foreign-key enforcement would reject valid rows. A migration leaves this connection with keys
// on; turn it back off for the copy phase.
await sql`PRAGMA foreign_keys = OFF`.execute(bundle)
await sql`
  CREATE TABLE IF NOT EXISTS "ReplayFileBlob" (
    "path" TEXT PRIMARY KEY NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BLOB NOT NULL
  )
`.execute(bundle)

const REPLAY_OWNER = 'production-replay-user'

const skipped: Array<{
  messageId: string
  conversationId: string
  auditedInputTokens: number
  reason: string
}> = []
const seenBackends = new Set<string>()
const seenAssistants = new Set<string>()
const seenAssistantVersions = new Set<string>()
const seenConversations = new Set<string>()
const seenMessages = new Set<string>()
const seenFileIds = new Set<string>()
const seenBlobIds = new Set<string>()
const seenBlobPaths = new Set<string>()
let admitted = 0

let candidates = source
  .selectFrom('MessageAudit')
  .innerJoin('Conversation', 'Conversation.id', 'MessageAudit.conversationId')
  .innerJoin('Assistant', 'Assistant.id', 'Conversation.assistantId')
  .innerJoin('AssistantVersion', 'AssistantVersion.id', 'Assistant.publishedVersionId')
  .select([
    'MessageAudit.messageId',
    'MessageAudit.conversationId',
    'MessageAudit.tokens as auditedInputTokens',
    'MessageAudit.sentAt',
    'Conversation.assistantId',
  ])
  .where('MessageAudit.type', '=', 'user')
  .where('MessageAudit.tokens', '>=', minimumAuditedInputTokens)
  .where('MessageAudit.sentAt', '>=', sinceIso)
  // The turn errored in production — not a clean baseline to compare a replay against.
  .where('MessageAudit.errors', 'is', null)
  // The assistant must still exist and still run the model this turn actually used, or the replay
  // measures a different assistant than the one that incurred the cost.
  .where('Assistant.deleted', '=', 0)
  .whereRef('MessageAudit.model', '=', 'AssistantVersion.model')
  // Assistants with tools or knowledge files can't be replayed faithfully; exclude them in SQL so
  // `--limit` counts admissible turns rather than being eaten by the (often most expensive)
  // tool/knowledge cohort. Sub-assistants are checked per row below — `subAssistants` is jsonb on
  // postgres, so it can't be string-compared here.
  .where((eb) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom('AssistantVersionToolAssociation')
          .select('toolId')
          .whereRef(
            'AssistantVersionToolAssociation.assistantVersionId',
            '=',
            'AssistantVersion.id'
          )
      )
    )
  )
  .where((eb) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom('AssistantVersionFile')
          .select('fileId')
          .whereRef('AssistantVersionFile.assistantVersionId', '=', 'AssistantVersion.id')
      )
    )
  )
  .orderBy('MessageAudit.tokens', 'desc')
  .orderBy('MessageAudit.sentAt', 'desc')
  // Lineage shape / attachment resolution can still skip a row, so scan a little past the target.
  .limit(limit * 10)
if (assistantFilter) candidates = candidates.where('Conversation.assistantId', '=', assistantFilter)

const skip = (
  candidate: { messageId: string; conversationId: string; auditedInputTokens: number },
  reason: string
) => {
  skipped.push({
    messageId: candidate.messageId,
    conversationId: candidate.conversationId,
    auditedInputTokens: candidate.auditedInputTokens,
    reason,
  })
}

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

try {
  for (const candidate of await candidates.execute()) {
    if (admitted >= limit) break
    if (distinctConversations && seenConversations.has(candidate.conversationId)) {
      skip(candidate, 'another turn from this conversation is already admitted')
      continue
    }

    const messages = await source
      .selectFrom('Message')
      .selectAll()
      .where('conversationId', '=', candidate.conversationId)
      .execute()
    const byId = new Map(messages.map((message) => [message.id, message]))

    const lineageRows: DbMessage[] = []
    let cursor = byId.get(candidate.messageId)
    while (cursor) {
      lineageRows.push(cursor)
      cursor = cursor.parent ? byId.get(cursor.parent) : undefined
    }
    lineageRows.reverse()

    let lineage: ReturnType<typeof dtoMessageFromDbMessage>[]
    try {
      lineage = lineageRows.map(dtoMessageFromDbMessage)
    } catch (error) {
      skip(candidate, `saved message cannot be converted: ${errText(error)}`)
      continue
    }
    const lineageReason = isReplayableLineage(lineage)
    if (lineageReason) {
      skip(candidate, lineageReason)
      continue
    }

    // The candidate query already excluded tool and knowledge-file assistants.
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
      .where('Assistant.id', '=', candidate.assistantId)
      .executeTakeFirst()
    if (!assistant) {
      skip(candidate, 'assistant or its published version is unavailable')
      continue
    }
    const subAssistants = assistant.subAssistants
      ? (JSON.parse(String(assistant.subAssistants)) as unknown[])
      : []
    if (Array.isArray(subAssistants) && subAssistants.length > 0) {
      skip(candidate, 'assistant has sub-assistants')
      continue
    }

    const productionResponse = messages
      .filter((message) => message.parent === candidate.messageId && message.role === 'assistant')
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0]
    if (!productionResponse) {
      skip(candidate, 'no saved assistant response follows the audited user message')
      continue
    }
    try {
      const productionMessage = dtoMessageFromDbMessage(productionResponse)
      if (
        productionMessage.role !== 'assistant' ||
        productionMessage.parts.some((part) => part.type.includes('tool-call'))
      ) {
        skip(candidate, 'production response begins tool activity; a tool fixture is required')
        continue
      }
      renderMessagePlainText(productionMessage)
    } catch (error) {
      skip(candidate, `saved production response cannot be converted: ${errText(error)}`)
      continue
    }

    // Resolve every attachment's File + FileBlob rows and bytes before writing anything.
    const attachmentFileIds = collectAttachmentFileIds(lineage)
    const attachmentRows: Array<{
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
    let attachmentFailure: string | undefined
    for (const fileId of attachmentFileIds) {
      const fileRow = await source
        .selectFrom('File')
        .select(['id', 'name', 'path', 'type', 'origin', 'createdAt', 'fileBlobId'])
        .where('id', '=', fileId)
        .executeTakeFirst()
      if (!fileRow) {
        attachmentFailure = `attachment ${fileId} has no File row`
        break
      }
      const blobRow = fileRow.fileBlobId
        ? await source
            .selectFrom('FileBlob')
            .select(['id', 'contentHash', 'path', 'type', 'size', 'encryption', 'createdAt'])
            .where('id', '=', fileRow.fileBlobId)
            .executeTakeFirst()
        : undefined
      if (fileRow.fileBlobId && !blobRow) {
        attachmentFailure = `attachment ${fileId} FileBlob ${fileRow.fileBlobId} is missing`
        break
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
      try {
        if (blobRow) await copyBlobBytes(blobRow.path, blobRow.encryption, blobRow.size)
        if (extractedTextPath)
          await copyBlobBytes(extractedTextPath, blobRow?.encryption ?? null, 0)
      } catch (error) {
        attachmentFailure = `attachment ${fileId} bytes could not be read: ${errText(error)}`
        break
      }
      attachmentRows.push({ file: fileRow, blob: blobRow ?? null, analysis: analysisRow ?? null })
    }
    if (attachmentFailure) {
      skip(candidate, attachmentFailure)
      continue
    }

    // --- write the turn into the bundle ---
    if (!seenBackends.has(assistant.backendId)) {
      const backend = await source
        .selectFrom('Backend')
        .selectAll()
        .where('id', '=', assistant.backendId)
        .executeTakeFirstOrThrow()
      await bundle.insertInto('Backend').values(backend).execute()
      seenBackends.add(assistant.backendId)
    }
    if (!seenAssistantVersions.has(assistant.versionId)) {
      const version = await source
        .selectFrom('AssistantVersion')
        .selectAll()
        .where('id', '=', assistant.versionId)
        .executeTakeFirstOrThrow()
      await bundle
        .insertInto('AssistantVersion')
        .values({ ...version, imageId: null })
        .execute()
      seenAssistantVersions.add(assistant.versionId)
    }
    if (!seenAssistants.has(assistant.assistantId)) {
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
      seenAssistants.add(assistant.assistantId)
    }
    if (!seenConversations.has(candidate.conversationId)) {
      const conversation = await source
        .selectFrom('Conversation')
        .selectAll()
        .where('id', '=', candidate.conversationId)
        .executeTakeFirstOrThrow()
      await bundle.insertInto('Conversation').values(conversation).execute()
      seenConversations.add(candidate.conversationId)
    }

    for (const row of [...lineageRows, productionResponse]) {
      if (seenMessages.has(row.id)) continue
      await bundle.insertInto('Message').values(row).execute()
      seenMessages.add(row.id)
    }

    const audit = await source
      .selectFrom('MessageAudit')
      .selectAll()
      .where('messageId', '=', candidate.messageId)
      .where('type', '=', 'user')
      .executeTakeFirstOrThrow()
    await bundle.insertInto('MessageAudit').values(audit).execute()

    for (const { file, blob, analysis } of attachmentRows) {
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
      if (seenFileIds.has(file.id)) continue
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
      seenFileIds.add(file.id)
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

    admitted += 1
    process.stderr.write(
      `admitted ${candidate.messageId} (${candidate.auditedInputTokens} input tokens)\n`
    )
  }
} finally {
  await source.destroy()
  await bundle.destroy()
}

await writeFile(`${out}.skipped.json`, JSON.stringify(skipped, null, 2), 'utf-8')
console.error(
  `Wrote ${admitted} replayable turn(s) to ${out} and ${skipped.length} skipped candidate(s) to ${out}.skipped.json.`
)
