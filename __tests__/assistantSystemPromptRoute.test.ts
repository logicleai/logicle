import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createAssistant } from '@/models/assistant'
import * as dto from '@/types/dto'
import * as systemPromptRoute from '@/api/me/assistants/[assistantId]/systemPrompt/route'

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

const makeDraft = (backendId: string, systemPrompt: string): dto.InsertableAssistantDraft => ({
  backendId,
  description: 'desc',
  model: 'gpt-4o-mini',
  name: 'assistant',
  versionName: null,
  systemPrompt,
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

let ownerId: string
let strangerCookie: string
let ownerCookie: string
let assistantId: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  await insertBackend('b1')

  const owner = await createUser({ name: 'Owner', email: 'owner@example.com', ssoUser: 0 })
  ownerId = owner.id
  const ownerSession = await createSession(owner.id, new Date(Date.now() + 60_000), 'password', null)
  ownerCookie = `${SESSION_COOKIE_NAME}=${ownerSession.id}`

  const stranger = await createUser({ name: 'Stranger', email: 'stranger@example.com', ssoUser: 0 })
  const strangerSession = await createSession(
    stranger.id,
    new Date(Date.now() + 60_000),
    'password',
    null
  )
  strangerCookie = `${SESSION_COOKIE_NAME}=${strangerSession.id}`

  const created = await createAssistant(makeDraft('b1', 'You are a secret private assistant'), ownerId)
  assistantId = created.assistantId
})

describe('GET /api/me/assistants/:assistantId/systemPrompt', () => {
  test('returns 403 for a user with no access to the assistant', async () => {
    const response = await systemPromptRoute.GET(
      new Request(`http://localhost/api/me/assistants/${assistantId}/systemPrompt`, {
        headers: { cookie: strangerCookie },
      }),
      { params: Promise.resolve({ assistantId }) }
    )

    expect(response.status).toBe(403)
  })

  test('returns the system prompt for the owner', async () => {
    const response = await systemPromptRoute.GET(
      new Request(`http://localhost/api/me/assistants/${assistantId}/systemPrompt`, {
        headers: { cookie: ownerCookie },
      }),
      { params: Promise.resolve({ assistantId }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      systemPrompt: 'You are a secret private assistant',
    })
  })

  test('returns 403 for an assistant that does not exist', async () => {
    const response = await systemPromptRoute.GET(
      new Request('http://localhost/api/me/assistants/missing/systemPrompt', {
        headers: { cookie: ownerCookie },
      }),
      { params: Promise.resolve({ assistantId: 'missing' }) }
    )

    expect(response.status).toBe(403)
  })
})
