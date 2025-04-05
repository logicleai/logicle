import * as fs from 'fs'
import * as path from 'path'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import env from './env'
import { createToolWithId, getTool, updateTool } from '@/models/tool'
import { parseDocument } from 'yaml'
import { createBackendWithId, getBackend, updateBackend } from '@/models/backend'
import { logger } from './logging'
import { createApiKeyWithId, getApiKey, updateApiKey } from '@/models/apikey'
import { createUserRawWithId, getUserById, updateUser } from '@/models/user'
import { createAssistantWithId, getAssistant, updateAssistant } from '@/models/assistant'
import { AssistantSharing } from '@/db/schema'
import { db } from '@/db/database'
import { z } from 'zod'
import { providerTypes } from '@/types/provider'

type ProvisionableTool = dto.InsertableTool & { capability?: number }
type ProvisionableBackend = dto.InsertableBackend
type ProvisionableUser = Omit<dto.InsertableUser, 'preferences' | 'image' | 'password'> & {
  password?: string | null
}
type ProvisionableApiKey = dto.InsertableApiKey
type ProvisionableAssistant = Omit<
  dto.InsertableAssistant,
  'tools' | 'files' | 'iconUri' | 'reasoning_effort'
> & {
  tools: string[]
  reasoning_effort?: 'low' | 'medium' | 'high' | null
}
type ProvisionableAssistantSharing = Omit<AssistantSharing, 'id' | 'provisioned'>

interface Provision {
  tools: Record<string, ProvisionableTool>
  backends: Record<string, ProvisionableBackend>
  users: Record<string, ProvisionableUser>
  apiKeys: Record<string, ProvisionableApiKey>
  assistants: Record<string, ProvisionableAssistant>
  assistantSharing: Record<string, ProvisionableAssistantSharing>
}

type AssertExtends<A, B extends A> = true
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never

const provisionedToolSchema = z
  .object({
    capability: z.number().optional(),
    configuration: z.object({}),
    name: z.string(),
    type: z.string(),
  })
  .strict()

type ProvisionedToolSchema = z.infer<typeof provisionedToolSchema>
const provisionedToolSchemaTest1: AssertExtends<ProvisionedToolSchema, ProvisionableTool> = true
const provisionedToolSchemaTest2: AssertExtends<ProvisionableTool, ProvisionedToolSchema> = true

const provisionedBackendSchema = z.object({
  name: z.string(),
  providerType: z.enum(providerTypes),
})
// can't make it strict because there are provider specific parameters
//.strict()

type ProvisionedBackendSchema = z.infer<typeof provisionedBackendSchema> & {}
const provisionedBackendSchemaTest1: AssertExtends<ProvisionedBackendSchema, ProvisionableBackend> =
  true
const provisionedBackendSchemaTest2: AssertExtends<ProvisionableBackend, ProvisionedBackendSchema> =
  true

const provisionedUserSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    password: z.string().nullable().optional(),
    role: z.nativeEnum(dto.UserRole),
  })
  .strict()

type ProvisionedUserSchema = z.infer<typeof provisionedUserSchema> & {}
const provisionedUserSchemaTest1: AssertExtends<ProvisionedUserSchema, ProvisionableUser> = true
const provisionedUserSchemaTest2: AssertExtends<ProvisionableUser, ProvisionedUserSchema> = true

const provisionedApiKeySchema = z.object({
  key: z.string(),
  userId: z.string(),
  description: z.string(),
  expiresAt: z.string().nullable(),
})

type ProvisionedApiKeySchema = z.infer<typeof provisionedApiKeySchema> & {}
const provisionedApiKeySchemaTest1: AssertExtends<ProvisionedApiKeySchema, ProvisionableApiKey> =
  true
const provisionedApiKeySchemaTest2: AssertExtends<ProvisionableApiKey, ProvisionedApiKeySchema> =
  true

const provisionedAssistantSchema = z
  .object({
    tools: z.array(z.string()),
    tags: z.array(z.string()),
    prompts: z.array(z.string()),
    systemPrompt: z.string(),
    temperature: z.number(),
    name: z.string(),
    model: z.string(),
    backendId: z.string(),
    tokenLimit: z.number(),
    description: z.string(),
    reasoning_effort: z.enum(schema.reasoningEffortValues).nullable().optional(),
    owner: z.string().nullable(),
  })
  .strict()

type ProvisionedAssistantSchema = z.infer<typeof provisionedAssistantSchema> & {}
const provisionedAssistantSchemaTest1: AssertEqual<
  ProvisionedAssistantSchema,
  ProvisionableAssistant
> = true

const provisionedAssistantSharingSchema = z
  .object({
    workspaceId: z.string().nullable(),
    assistantId: z.string(),
  })
  .strict()

type ProvisionedAssistantSharingSchema = z.infer<typeof provisionedAssistantSharingSchema> & {}
const provisionedAssistantSharingSchemaTest1: AssertExtends<
  ProvisionedAssistantSharingSchema,
  ProvisionableAssistantSharing
> = true
const provisionedAssistantSharingSchemaTest2: AssertExtends<
  ProvisionableAssistantSharing,
  ProvisionedAssistantSharingSchema
> = true

export async function provision() {
  const provisionPath = env.provision.source
  if (!provisionPath) return
  if (!fs.existsSync(provisionPath)) {
    throw new Error(`No provisioning file at ${provisionPath}`)
  }
  const stats = fs.lstatSync(provisionPath)
  if (stats.isDirectory()) {
    const children = fs.readdirSync(provisionPath).sort()
    for (const child of children) {
      const childPath = path.resolve(provisionPath, child)
      await provisionFile(childPath)
    }
  } else {
    await provisionFile(provisionPath)
  }
}

const provisionTools = async (tools: Record<string, ProvisionableTool>) => {
  for (const id in tools) {
    const provisioned = tools[id]
    const existing = await getTool(id)
    if (existing) {
      await updateTool(id, provisioned)
    } else {
      await createToolWithId(id, provisioned, true)
    }
  }
}

const provisionBackends = async (backends: Record<string, ProvisionableBackend>) => {
  for (const id in backends) {
    const provisioned = backends[id]
    const existing = await getBackend(id)
    if (existing) {
      await updateBackend(id, provisioned)
    } else {
      await createBackendWithId(id, provisioned, true)
    }
  }
}

const provisionUsers = async (users: Record<string, ProvisionableUser>) => {
  for (const id in users) {
    const provisioned = {
      ...users[id],
      preferences: '{}',
      password: users[id].password ?? null,
    }
    const existing = await getUserById(id)
    if (existing) {
      await updateUser(id, provisioned)
    } else {
      await createUserRawWithId(id, provisioned, true)
    }
  }
}

const provisionApiKeys = async (apiKeys: Record<string, ProvisionableApiKey>) => {
  for (const id in apiKeys) {
    const provisioned = apiKeys[id]
    const existing = await getApiKey(id)
    if (existing) {
      await updateApiKey(id, provisioned)
    } else {
      await createApiKeyWithId(id, provisioned, true)
    }
  }
}

const provisionAssistants = async (assistants: Record<string, ProvisionableAssistant>) => {
  for (const id in assistants) {
    const provisioned = {
      ...assistants[id],
      files: [] as dto.AssistantFile[],
      tools: assistants[id].tools.map((tool) => {
        return {
          id: tool,
          name: '',
          enabled: true,
          capability: 0,
          provisioned: 1,
        }
      }),
      reasoning_effort: assistants[id].reasoning_effort ?? null,
      iconUri: null,
    }
    const existing = await getAssistant(id)
    if (existing) {
      await updateAssistant(id, provisioned)
    } else {
      await createAssistantWithId(id, provisioned, true)
    }
  }
}

const provisionAssistantSharing = async (
  assistantSharing: Record<string, ProvisionableAssistantSharing>
) => {
  for (const id in assistantSharing) {
    for (const id in assistantSharing) {
      const provisioned = {
        ...assistantSharing[id],
        provisioned: 1,
      }
      const existing = await db
        .selectFrom('AssistantSharing')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (existing) {
        await db.updateTable('AssistantSharing').set(provisioned).where('id', '=', id).execute()
      } else {
        await db
          .insertInto('AssistantSharing')
          .values([
            {
              ...provisioned,
              id,
            },
          ])
          .execute()
      }
    }
  }
}

const provisionSchema = z.object({
  tools: z.record(z.string(), provisionedToolSchema),
  backends: z.record(z.string(), provisionedBackendSchema),
  users: z.record(z.string(), provisionedUserSchema),
  apiKeys: z.record(z.string(), provisionedApiKeySchema),
  assistants: z.record(z.string(), provisionedAssistantSchema),
  assistantSharing: z.record(z.string(), provisionedAssistantSharingSchema),
})

export async function provisionFile(path: string) {
  logger.info(`provisioning from file ${path}`)
  const content = fs.readFileSync(path)
  const provisionData = parseDocument(content.toString('utf-8')).toJSON() as Provision

  provisionSchema.parse(provisionData)

  await provisionTools(provisionData.tools)
  await provisionBackends(provisionData.backends)
  await provisionUsers(provisionData.users)
  await provisionApiKeys(provisionData.apiKeys)
  await provisionAssistants(provisionData.assistants)
  await provisionAssistantSharing(provisionData.assistantSharing)
}
