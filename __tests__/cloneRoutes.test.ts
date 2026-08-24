import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter, sql } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createAssistant } from '@/models/assistant'
import { createConversation } from '@/models/conversation'
import { saveMessage } from '@/models/message'
import * as dto from '@/types/dto'
import * as assistantCloneRoute from '@/api/assistants/[assistantId]/clone/route'
import * as sharedConversationCloneRoute from '@/api/share/[shareId]/clone/route'

function getDialectName(client: Kysely<any>) {
  if (client.getExecutor().adapter instanceof SqliteAdapter) return 'sqlite'
  if (client.getExecutor().adapter instanceof PostgresAdapter) return 'postgresql'
  return undefined
}

async function migrateTestDb() {
  const dialectName = getDialectName(db)
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () =>
        Object.fromEntries(
          Object.entries(migrationModules).map(([name, migration]) => [
            name,
            {
              up: async (client: Kysely<any>) => {
                await (
                  migration as { up: (db: Kysely<any>, dialect?: string) => Promise<void> }
                ).up(client, dialectName)
              },
            } satisfies Migration,
          ])
        ),
    },
  })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

async function resetTables() {
  await db.deleteFrom('ConversationSharing').execute()
  await db.deleteFrom('Message').execute()
  await db.deleteFrom('Conversation').execute()
  await db.deleteFrom('AssistantVersionFile').execute()
  await db.deleteFrom('AssistantVersionToolAssociation').execute()
  await db.deleteFrom('AssistantVersion').execute()
  await db.deleteFrom('AssistantSharing').execute()
  await db.deleteFrom('Assistant').execute()
  await db.deleteFrom('File').execute()
  await db.deleteFrom('FileBlob').execute()
  await db.deleteFrom('Backend').execute()
  await db.deleteFrom('Session').execute()
  await db.deleteFrom('User').execute()
}

async function insertBackend(id: string) {
  await db
    .insertInto('Backend')
    .values({
      id,
      name: `Backend ${id}`,
      providerType: 'openai',
      configuration: '{}',
      provisioned: 0,
    })
    .execute()
}

async function insertUploadedFile(params: {
  id: string
  ownerType: 'USER' | 'CHAT' | 'ASSISTANT' | 'TOOL'
  ownerId: string
  name?: string
  type?: string
}) {
  const fileName = params.name ?? `${params.id}.txt`
  const mimeType = params.type ?? 'text/plain'
  await db
    .insertInto('FileBlob')
    .values({
      id: params.id,
      contentHash: `legacy:${params.id}`,
      path: `files/${params.id}-${fileName}`,
      type: mimeType,
      size: 123,
      encryption: null,
      createdAt: new Date().toISOString(),
    })
    .execute()

  await sql`
    INSERT INTO "File" ("id", "name", "path", "type", "size", "uploaded", "createdAt", "encrypted", "fileBlobId", "ownerType", "ownerId")
    VALUES (${params.id}, ${fileName}, ${`files/${params.id}-${fileName}`}, ${mimeType}, ${123}, ${1}, ${new Date().toISOString()}, ${0}, ${params.id}, ${params.ownerType}, ${params.ownerId})
  `.execute(db)
}

const makeDraft = (backendId: string, fileIds: string[]): dto.InsertableAssistantDraft => ({
  backendId,
  description: 'desc',
  model: 'gpt-4o-mini',
  name: 'assistant',
  versionName: null,
  systemPrompt: 'You are helpful',
  temperature: 0,
  tokenLimit: 4096,
  reasoning_effort: null,
  contextCompression: null,
  tags: [],
  prompts: [],
  tools: [],
  files: fileIds.map((id) => ({ id, name: `${id}.txt`, type: 'text/plain', size: 123 })),
  iconUri: null,
  subAssistants: [],
})

let userId: string
let sessionCookie: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  await insertBackend('b1')

  const user = await createUser({ name: 'Test User', email: 'clone-tests@example.com', ssoUser: 0 })
  userId = user.id
  const session = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)
  sessionCookie = `${SESSION_COOKIE_NAME}=${session.id}`
})

describe('clone routes duplicate files', () => {
  test('assistant clone duplicates assistant files into new file ids', async () => {
    await insertUploadedFile({ id: 'f-source-assistant', ownerType: 'USER', ownerId: userId })
    const sourceAssistant = await createAssistant(makeDraft('b1', ['f-source-assistant']), userId)

    const response = await assistantCloneRoute.POST(
      new Request(`http://localhost/api/assistants/${sourceAssistant.assistantId}/clone`, {
        method: 'POST',
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ assistantId: sourceAssistant.assistantId }) }
    )

    expect(response.status).toBe(201)

    const assistants = await db
      .selectFrom('Assistant')
      .select(['id', 'owner'])
      .where('owner', '=', userId)
      .execute()
    expect(assistants).toHaveLength(2)
    const clonedAssistantId = assistants.find((assistant) => assistant.id !== sourceAssistant.assistantId)?.id
    expect(clonedAssistantId).toBeTruthy()

    const clonedAssistant = await db
      .selectFrom('Assistant')
      .select(['id', 'publishedVersionId'])
      .where('id', '=', clonedAssistantId!)
      .executeTakeFirstOrThrow()

    const clonedFiles = await db
      .selectFrom('AssistantVersionFile')
      .innerJoin('File', 'File.id', 'AssistantVersionFile.fileId')
      .select([
        'AssistantVersionFile.fileId as fileId',
        'File.ownerType as ownerType',
        'File.ownerId as ownerId',
      ])
      .where('AssistantVersionFile.assistantVersionId', '=', clonedAssistant.publishedVersionId!)
      .execute()

    expect(clonedFiles).toHaveLength(1)
    expect(clonedFiles[0].fileId).not.toBe('f-source-assistant')
    expect(clonedFiles[0].ownerType).toBe('ASSISTANT')
    expect(clonedFiles[0].ownerId).toBe(clonedAssistant.id)
  })

  test('shared chat clone duplicates attachment files for new conversation owner', async () => {
    const sourceOwner = await createUser({
      name: 'Source User',
      email: 'clone-source@example.com',
      ssoUser: 0,
    })
    const targetUser = await createUser({
      name: 'Target User',
      email: 'clone-target@example.com',
      ssoUser: 0,
    })
    const targetSession = await createSession(
      targetUser.id,
      new Date(Date.now() + 60_000),
      'password',
      null
    )
    const targetCookie = `${SESSION_COOKIE_NAME}=${targetSession.id}`

    const assistant = await createAssistant(makeDraft('b1', []), targetUser.id)
    const sourceConversation = await createConversation(sourceOwner.id, {
      assistantId: assistant.assistantId,
      name: 'Shared conversation',
    })

    await insertUploadedFile({
      id: 'f-source-chat',
      ownerType: 'CHAT',
      ownerId: sourceConversation.id,
      name: 'note.txt',
    })

    const sourceMessage: dto.UserMessage = {
      id: 'm-source-user',
      conversationId: sourceConversation.id,
      parent: null,
      sentAt: new Date().toISOString(),
      role: 'user',
      content: 'hello',
      attachments: [
        {
          id: 'f-source-chat',
          mimetype: 'text/plain',
          name: 'note.txt',
          size: 123,
        },
      ],
    }
    await saveMessage(sourceMessage)

    await db
      .insertInto('ConversationSharing')
      .values({ id: 'share-1', lastMessageId: sourceMessage.id })
      .execute()

    const response = await sharedConversationCloneRoute.POST(
      new Request('http://localhost/api/share/share-1/clone', {
        method: 'POST',
        headers: { cookie: targetCookie },
      }),
      { params: Promise.resolve({ shareId: 'share-1' }) }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as dto.ConversationWithMessages
    const clonedConversationId = body.conversation.id
    const clonedUserMessage = body.messages.find((message) => message.role === 'user') as dto.UserMessage
    expect(clonedUserMessage).toBeTruthy()
    expect(clonedUserMessage.attachments).toHaveLength(1)
    const clonedFileId = clonedUserMessage.attachments[0].id
    expect(clonedFileId).not.toBe('f-source-chat')

    const clonedFile = await db
      .selectFrom('File')
      .select(['id', 'ownerType', 'ownerId', 'fileBlobId'])
      .where('id', '=', clonedFileId)
      .executeTakeFirstOrThrow()
    const sourceFile = await db
      .selectFrom('File')
      .select(['id', 'fileBlobId'])
      .where('id', '=', 'f-source-chat')
      .executeTakeFirstOrThrow()

    expect(clonedFile.ownerType).toBe('CHAT')
    expect(clonedFile.ownerId).toBe(clonedConversationId)
    expect(clonedFile.fileBlobId).toBe(sourceFile.fileBlobId)
  })

  test('shared chat clone does not duplicate a file id planted in the conversation that the cloning user cannot access', async () => {
    const sourceOwner = await createUser({
      name: 'Source User 2',
      email: 'clone-source-2@example.com',
      ssoUser: 0,
    })
    const victim = await createUser({
      name: 'Victim User',
      email: 'clone-victim@example.com',
      ssoUser: 0,
    })
    const targetUser = await createUser({
      name: 'Target User 2',
      email: 'clone-target-2@example.com',
      ssoUser: 0,
    })
    const targetSession = await createSession(
      targetUser.id,
      new Date(Date.now() + 60_000),
      'password',
      null
    )
    const targetCookie = `${SESSION_COOKIE_NAME}=${targetSession.id}`

    const assistant = await createAssistant(makeDraft('b1', []), targetUser.id)
    const sourceConversation = await createConversation(sourceOwner.id, {
      assistantId: assistant.assistantId,
      name: 'Shared conversation with a planted attachment',
    })

    // Simulates a malicious/legacy message that references a file the sender never
    // owned — a file privately owned by a third, unrelated user.
    await insertUploadedFile({
      id: 'f-victim-private',
      ownerType: 'USER',
      ownerId: victim.id,
      name: 'private.txt',
    })

    const sourceMessage: dto.UserMessage = {
      id: 'm-source-user-2',
      conversationId: sourceConversation.id,
      parent: null,
      sentAt: new Date().toISOString(),
      role: 'user',
      content: 'hello',
      attachments: [
        {
          id: 'f-victim-private',
          mimetype: 'text/plain',
          name: 'private.txt',
          size: 123,
        },
      ],
    }
    await saveMessage(sourceMessage)

    await db
      .insertInto('ConversationSharing')
      .values({ id: 'share-2', lastMessageId: sourceMessage.id })
      .execute()

    const response = await sharedConversationCloneRoute.POST(
      new Request('http://localhost/api/share/share-2/clone', {
        method: 'POST',
        headers: { cookie: targetCookie },
      }),
      { params: Promise.resolve({ shareId: 'share-2' }) }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as dto.ConversationWithMessages
    const clonedUserMessage = body.messages.find((message) => message.role === 'user') as dto.UserMessage
    expect(clonedUserMessage).toBeTruthy()
    // The unauthorized attachment id is left unmapped, not duplicated into a new
    // CHAT-owned row the cloning user could then read directly.
    expect(clonedUserMessage.attachments[0]?.id).toBe('f-victim-private')

    const clonedRows = await db
      .selectFrom('File')
      .select(['id'])
      .where('ownerType', '=', 'CHAT')
      .where('ownerId', '=', body.conversation.id)
      .execute()
    expect(clonedRows).toHaveLength(0)
  })
})
