import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createAssistant } from '@/models/assistant'
import * as dto from '@/types/dto'
import * as conversationsRoute from '@/api/conversations/route'

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
let ownAssistantId: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  await insertBackend('b1')

  const otherOwner = await createUser({
    name: 'Other Owner',
    email: 'convcreate-other@example.com',
    ssoUser: 0,
  })
  const privateAssistant = await createAssistant(makeDraft('b1'), otherOwner.id)
  privateAssistantId = privateAssistant.assistantId

  const requester = await createUser({
    name: 'Requester',
    email: 'convcreate-requester@example.com',
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

  const ownAssistant = await createAssistant(makeDraft('b1'), requester.id)
  ownAssistantId = ownAssistant.assistantId
})

describe('POST /api/conversations', () => {
  test('returns 403 and creates nothing when the assistant is not accessible to the caller', async () => {
    const response = await conversationsRoute.POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        headers: { cookie: requesterCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ assistantId: privateAssistantId, name: 'hijacked' }),
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

  test('creates a conversation when the caller owns the assistant', async () => {
    const response = await conversationsRoute.POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        headers: { cookie: requesterCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ assistantId: ownAssistantId, name: 'my chat' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.assistantId).toBe(ownAssistantId)
    expect(body.ownerId).toBe(requesterId)
  })
})
