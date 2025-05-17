import * as fs from 'fs'
import * as path from 'path'
import * as dto from '@/types/dto'
import env from './env'
import { createToolWithId, getTool, updateTool } from '@/models/tool'
import { parseDocument } from 'yaml'
import { createBackendWithId, getBackend, updateBackend } from '@/models/backend'
import { logger } from './logging'
import { createApiKeyWithId, getApiKey, updateApiKey } from '@/models/apikey'
import { createUserRawWithId, getUserById, updateUser } from '@/models/user'
import { createAssistantWithId, getAssistant, updateAssistantVersion } from '@/models/assistant'
import { AssistantSharing } from '@/db/schema'
import { db } from '@/db/database'
import { ProviderConfig } from '@/types/provider'
import { provisionSchema } from './provision_schema'

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type ProvisionableTool = MakeOptional<
  dto.InsertableTool,
  'tags' | 'description' | 'promptFragment' | 'icon'
> & {
  capability?: boolean
}
export type ProvisionableBackend = Omit<ProviderConfig, 'provisioned'>
export type ProvisionableUser = Omit<
  dto.InsertableUser,
  'preferences' | 'image' | 'password' | 'ssoUser'
> & {
  password?: string | null
}
export type ProvisionableApiKey = dto.InsertableApiKey
export type ProvisionableAssistant = Omit<
  dto.InsertableAssistant,
  'tools' | 'files' | 'iconUri' | 'reasoning_effort'
> & {
  tools: string[]
  icon?: string
  owner: string
  reasoning_effort?: 'low' | 'medium' | 'high' | null
}
export type ProvisionableAssistantSharing = Omit<AssistantSharing, 'id' | 'provisioned'>

interface Provision {
  tools?: Record<string, ProvisionableTool>
  backends?: Record<string, ProvisionableBackend>
  users?: Record<string, ProvisionableUser>
  apiKeys?: Record<string, ProvisionableApiKey>
  assistants?: Record<string, ProvisionableAssistant>
  assistantSharing?: Record<string, ProvisionableAssistantSharing>
}

export async function provision() {
  const provisionPath = env.provision.config
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
    const tool = {
      description: '',
      tags: [],
      promptFragment: '',
      icon: null,
      ...tools[id],
    }
    const existing = await getTool(id)
    const capability = tool.capability ? true : false
    const provisioned = true
    if (existing) {
      await updateTool(id, tool, capability)
    } else {
      await createToolWithId(id, tool, capability, provisioned)
    }
  }
}

const provisionBackends = async (backends: Record<string, ProvisionableBackend>) => {
  for (const id in backends) {
    const backend = backends[id]
    const existing = await getBackend(id)
    if (existing) {
      await updateBackend(id, backend)
    } else {
      await createBackendWithId(id, backend, true)
    }
  }
}

const provisionUsers = async (users: Record<string, ProvisionableUser>) => {
  for (const id in users) {
    const user = {
      ...users[id],
      ssoUser: 0,
      preferences: '{}',
      password: users[id].password ?? null,
    }
    const existing = await getUserById(id)
    if (existing) {
      await updateUser(id, user)
    } else {
      await createUserRawWithId(id, user, true)
    }
  }
}

const provisionApiKeys = async (apiKeys: Record<string, ProvisionableApiKey>) => {
  for (const id in apiKeys) {
    const apiKey = apiKeys[id]
    const existing = await getApiKey(id)
    if (existing) {
      await updateApiKey(id, apiKey)
    } else {
      await createApiKeyWithId(id, apiKey, true)
    }
  }
}

const provisionAssistants = async (assistants: Record<string, ProvisionableAssistant>) => {
  for (const id in assistants) {
    const existing = await getAssistant(id)
    const { icon, owner, ...assistant } = assistants[id]
    const insertableAssistant = {
      ...assistant,
      files: [] as dto.AssistantFile[],
      tools: assistant.tools.map((tool) => {
        return {
          id: tool,
          name: '',
          enabled: true,
          capability: 0,
          provisioned: 1,
        }
      }),
      reasoning_effort: assistant.reasoning_effort ?? null,
      iconUri: icon ?? null,
    }

    if (existing) {
      // Update the version with same id of the assistant...
      await updateAssistantVersion(id, insertableAssistant)
      // TODO: handle owner / deleted changes
    } else {
      await createAssistantWithId(id, insertableAssistant, owner, true)
    }
  }
}

const provisionAssistantSharing = async (
  assistantSharing: Record<string, ProvisionableAssistantSharing>
) => {
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

export async function provisionFile(path: string) {
  logger.info(`provisioning from file ${path}`)
  const content = fs.readFileSync(path)
  const provisionData = parseDocument(content.toString('utf-8')).toJSON() as Provision

  provisionSchema.parse(provisionData)

  if (provisionData.tools) await provisionTools(provisionData.tools)
  if (provisionData.backends) await provisionBackends(provisionData.backends)
  if (provisionData.users) await provisionUsers(provisionData.users)
  if (provisionData.apiKeys) await provisionApiKeys(provisionData.apiKeys)
  if (provisionData.assistants) await provisionAssistants(provisionData.assistants)
  if (provisionData.assistantSharing)
    await provisionAssistantSharing(provisionData.assistantSharing)
}
