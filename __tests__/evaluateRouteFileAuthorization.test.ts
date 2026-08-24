import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'

const canAccessFileMock = vi.fn()
const getBackendMock = vi.fn()
const availableToolsFilteredMock = vi.fn()
const getUserParametersMock = vi.fn()
const getUserSecretValueMock = vi.fn()
const chatAssistantBuildMock = vi.fn()
const assistantParamsFromMock = vi.fn()

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: canAccessFileMock,
}))
vi.mock('@/models/backend', () => ({ getBackend: getBackendMock }))
vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsFiltered: availableToolsFilteredMock,
}))
vi.mock('@/lib/parameters', () => ({ getUserParameters: getUserParametersMock }))
vi.mock('@/models/userSecrets', () => ({ getUserSecretValue: getUserSecretValueMock }))
vi.mock('@/backend/lib/chat', () => ({
  ChatAssistant: {
    build: chatAssistantBuildMock,
    assistantParamsFrom: assistantParamsFromMock,
  },
}))

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
  await db.deleteFrom('Session').execute()
  await db.deleteFrom('User').execute()
}

const now = new Date().toISOString()

const makeAssistantDraft = (fileIds: string[]) => ({
  id: 'a1',
  assistantId: 'a1',
  backendId: 'b1',
  description: '',
  model: 'gpt-4o-mini',
  name: 'assistant',
  versionName: null,
  systemPrompt: 'hi',
  temperature: 0,
  tokenLimit: 4096,
  reasoning_effort: null,
  contextCompression: null,
  createdAt: now,
  updatedAt: now,
  owner: 'someone',
  tools: [],
  files: fileIds.map((id) => ({ id, name: `${id}.txt`, type: 'text/plain', size: 1 })),
  sharing: [],
  tags: [],
  prompts: [],
  iconUri: null,
  provisioned: false,
  hidden: false,
  pendingChanges: false,
  subAssistants: [],
})

let sessionCookie: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  vi.clearAllMocks()
  getBackendMock.mockResolvedValue({ id: 'b1', providerType: 'openai', configuration: '{}' })
  availableToolsFilteredMock.mockResolvedValue([])
  getUserParametersMock.mockResolvedValue({})
  assistantParamsFromMock.mockReturnValue({})

  const user = await createUser({ name: 'Evaluator', email: 'evaluate-route@example.com', ssoUser: 0 })
  const session = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)
  sessionCookie = `${SESSION_COOKIE_NAME}=${session.id}`
})

describe('POST /api/assistants/evaluate', () => {
  test('returns 403 and never builds a run when the draft references an inaccessible file', async () => {
    canAccessFileMock.mockResolvedValue(false)
    const { POST } = await import('@/api/assistants/evaluate/route')

    const response = await POST(
      new Request('http://localhost/api/assistants/evaluate', {
        method: 'POST',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          assistant: makeAssistantDraft(['other-tenant-file']),
          messages: [
            {
              id: 'm1',
              conversationId: 'preview',
              parent: null,
              sentAt: now,
              role: 'user',
              content: 'hi',
              attachments: [],
            },
          ],
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(canAccessFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      'other-tenant-file'
    )
    expect(response.status).toBe(403)
    expect(chatAssistantBuildMock).not.toHaveBeenCalled()
  })

  test('proceeds to build a run when every referenced file is accessible', async () => {
    canAccessFileMock.mockResolvedValue(true)
    chatAssistantBuildMock.mockResolvedValue({
      sendUserMessageAndStreamResponse: vi.fn().mockResolvedValue(new ReadableStream()),
    })
    const { POST } = await import('@/api/assistants/evaluate/route')

    const response = await POST(
      new Request('http://localhost/api/assistants/evaluate', {
        method: 'POST',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          assistant: makeAssistantDraft(['own-file']),
          messages: [
            {
              id: 'm1',
              conversationId: 'preview',
              parent: null,
              sentAt: now,
              role: 'user',
              content: 'hi',
              attachments: [],
            },
          ],
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    expect(chatAssistantBuildMock).toHaveBeenCalled()
  })
})
