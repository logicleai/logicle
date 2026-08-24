import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createAssistant } from '@/models/assistant'
import * as dto from '@/types/dto'
import * as responsesRoute from '@/api/v1/responses/route'

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
  await db.deleteFrom('Conversation').execute()
  await db.deleteFrom('AssistantVersion').execute()
  await db.deleteFrom('AssistantSharing').execute()
  await db.deleteFrom('Assistant').execute()
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

const makeDraft = (backendId: string): dto.InsertableAssistantDraft => ({
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
  files: [],
  iconUri: null,
  subAssistants: [],
})

let requesterCookie: string
let requesterId: string
let privateAssistantId: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  await insertBackend('b1')

  const otherOwner = await createUser({
    name: 'Other Owner',
    email: 'v1resp-other@example.com',
    ssoUser: 0,
  })
  const privateAssistant = await createAssistant(makeDraft('b1'), otherOwner.id)
  privateAssistantId = privateAssistant.assistantId

  const requester = await createUser({
    name: 'Requester',
    email: 'v1resp-requester@example.com',
    ssoUser: 0,
  })
  requesterId = requester.id
  const requesterSession = await createSession(
    requester.id,
    new Date(Date.now() + 60_000),
    'password',
    null
  )
  requesterCookie = `${SESSION_COOKIE_NAME}=${requesterSession.id}`
})

describe('POST /api/v1/responses', () => {
  test('returns 403 and creates no conversation when starting a run against an inaccessible assistant', async () => {
    const response = await responsesRoute.POST(
      new Request('http://localhost/api/v1/responses', {
        method: 'POST',
        headers: { cookie: requesterCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'hello', assistant: privateAssistantId }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(403)
    const conversations = await db
      .selectFrom('Conversation')
      .select('id')
      .where('assistantId', '=', privateAssistantId)
      .execute()
    expect(conversations).toHaveLength(0)
  })

  test('returns 403 when continuing a run on a conversation whose assistant is no longer accessible', async () => {
    await db
      .insertInto('Conversation')
      .values({
        id: 'c-revoked',
        assistantId: privateAssistantId,
        name: 'revoked',
        ownerId: requesterId,
        createdAt: new Date().toISOString(),
      })
      .execute()
    await db
      .insertInto('Message')
      .values({
        id: 'm-first',
        content: 'hello',
        conversationId: 'c-revoked',
        parent: null,
        role: 'user',
        sentAt: new Date().toISOString(),
        version: null,
      })
      .execute()

    const response = await responsesRoute.POST(
      new Request('http://localhost/api/v1/responses', {
        method: 'POST',
        headers: { cookie: requesterCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'follow up', previous_response: 'm-first' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(403)
  })
})
