import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dto from '@/types/dto'
import { z } from 'zod'
import env from './env'
import { createToolWithId, getTool, updateTool } from '@/models/tool'
import { parseDocument } from 'yaml'
import { createBackendWithId, getBackend, updateBackend } from '@/models/backend'
import { logger } from './logging'
import { createApiKeyWithId, getApiKey, updateApiKey } from '@/models/apikey'
import { createUserRawWithId, getUserById, updateUser } from '@/models/user'
import { createAssistantWithId, getAssistant, updateAssistantVersion } from '@/models/assistant'
import { db } from '@/db/database'
import { toolConfigSchema } from './tools/configSchema'
import {
  provisionableUserSchema,
  provisionedApiKeySchema,
  provisionedAssistantSchema,
  provisionedAssistantSharingSchema,
  provisionedBackendSchema,
  provisionedParameterSchema,
  provisionedToolSchema,
  provisionSchema,
} from './provision_schema'

export type ProvisionableTool = z.infer<typeof provisionedToolSchema>
export type ProvisionableBackend = z.infer<typeof provisionedBackendSchema>
export type ProvisionableUser = z.infer<typeof provisionableUserSchema>
export type ProvisionableApiKey = z.infer<typeof provisionedApiKeySchema>
export type ProvisionableAssistant = z.infer<typeof provisionedAssistantSchema>
export type ProvisionableAssistantSharing = z.infer<typeof provisionedAssistantSharingSchema>
export type ProvisionableParameter = z.infer<typeof provisionedParameterSchema>

interface Provision {
  tools?: Record<string, ProvisionableTool>
  backends?: Record<string, ProvisionableBackend>
  users?: Record<string, ProvisionableUser>
  apiKeys?: Record<string, ProvisionableApiKey>
  assistants?: Record<string, ProvisionableAssistant>
  assistantSharing?: Record<string, ProvisionableAssistantSharing>
  parameters?: Record<string, ProvisionableParameter>
}

type YamlDocument = ReturnType<typeof parseDocument>

const formatZodPath = (path: Array<string | number>) =>
  path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace('.[', '[')

const offsetToLineCol = (source: string, offset: number) => {
  const clipped = source.slice(0, Math.max(0, offset))
  const lines = clipped.split('\n')
  const line = lines.length
  const col = (lines[lines.length - 1] ?? '').length + 1
  return { line, col }
}

const findYamlNode = (doc: YamlDocument | undefined, path: Array<string | number>) => {
  if (!doc) return undefined
  try {
    return doc.getIn(path, true)
  } catch {
    return undefined
  }
}

const formatZodIssues = (
  issues: z.core.$ZodIssue[],
  context: {
    doc?: YamlDocument
    source?: string
    basePath?: Array<string | number>
    filePath?: string
  }
) => {
  const { doc, source, basePath = [], filePath } = context
  return issues.map((issue) => {
    const issuePath = issue.path as Array<string | number>
    const fullPath = [...basePath, ...issuePath]
    const pathLabel = formatZodPath(fullPath)
    const node = findYamlNode(doc, fullPath) as { range?: [number, number, number?] } | undefined
    const location =
      node?.range && source
        ? (() => {
            const { line, col } = offsetToLineCol(source, node.range[0])
            return `${filePath ?? 'provision'}:${line}:${col}`
          })()
        : undefined
    const details =
      issue.code === 'invalid_type' && 'expected' in issue && 'received' in issue
        ? `expected ${String(issue.expected)}, received ${String(issue.received)}`
        : issue.code === 'invalid_value' && 'values' in issue
        ? `expected one of ${JSON.stringify(issue.values)}`
        : undefined
    const detailText = details ? ` (${details})` : ''
    const locationText = location ? `${location} ` : ''
    return `${locationText}${issue.message}${detailText} at ${pathLabel}`
  })
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

const provisionTools = async (
  tools: Record<string, ProvisionableTool>,
  context?: {
    doc?: YamlDocument
    source?: string
    filePath?: string
  }
) => {
  for (const id in tools) {
    const tool = {
      description: '',
      tags: [],
      promptFragment: '',
      icon: null,
      configuration: {},
      sharing: {
        type: 'public',
      },
      ...tools[id],
    } satisfies dto.InsertableTool
    const configSchema = await toolConfigSchema(tool.type, tool.configuration)
    if (!configSchema) {
      throw new Error(`Unknown tool type "${tool.type}" in provisioning for tool "${id}"`)
    }
    try {
      tool.configuration = configSchema.parse(tool.configuration ?? {})
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedIssues = formatZodIssues(error.issues, {
          doc: context?.doc,
          source: context?.source,
          filePath: context?.filePath,
          basePath: ['tools', id, 'configuration'],
        })
        logger.error(`Invalid configuration for tool "${id}" (${tool.type})`, {
          issues: formattedIssues,
          configuration: tool.configuration ?? {},
        })
      } else {
        logger.error(`Invalid configuration for tool "${id}" (${tool.type})`, {
          error,
          configuration: tool.configuration ?? {},
        })
      }
      throw error
    }
    const existing = await getTool(id)
    const capability = !!tool.capability
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
      await updateApiKey(id, apiKey.key, apiKey)
    } else {
      await createApiKeyWithId(id, apiKey.key, apiKey, true)
    }
  }
}

const provisionAssistants = async (assistants: Record<string, ProvisionableAssistant>) => {
  for (const id in assistants) {
    const existing = await getAssistant(id)
    const { icon, owner, ...assistant } = assistants[id]
    const insertableAssistantDraft = {
      ...assistant,
      files: [] as dto.AssistantFile[],
      reasoning_effort: assistant.reasoning_effort ?? null,
      iconUri: icon ?? null,
    }

    if (existing) {
      // Update the version with same id of the assistant...
      await updateAssistantVersion(id, insertableAssistantDraft)
      // TODO: handle owner / deleted changes
    } else {
      await createAssistantWithId(id, insertableAssistantDraft, owner, true)
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

const provisionParameters = async (parameters: Record<string, ProvisionableParameter>) => {
  for (const id in parameters) {
    const provisioned = {
      ...parameters[id],
      provisioned: 1,
    }
    const existing = await db
      .selectFrom('Parameter')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (existing) {
      await db.updateTable('Parameter').set(provisioned).where('id', '=', id).execute()
    } else {
      await db
        .insertInto('Parameter')
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
  const source = content.toString('utf-8')
  const doc = parseDocument(source)
  const json = doc.toJSON()

  const result = provisionSchema.safeParse(json)
  if (!result.success) {
    const formattedIssues = formatZodIssues(result.error.issues, {
      doc,
      source,
      filePath: path,
    })
    throw new Error(`Provisioning file ${path} is invalid:\n${formattedIssues.join('\n')}`)
  }
  const provisionData: Provision = result.data

  if (provisionData.tools)
    await provisionTools(provisionData.tools, { doc, source, filePath: path })
  if (provisionData.backends) await provisionBackends(provisionData.backends)
  if (provisionData.users) await provisionUsers(provisionData.users)
  if (provisionData.apiKeys) await provisionApiKeys(provisionData.apiKeys)
  if (provisionData.assistants) await provisionAssistants(provisionData.assistants)
  if (provisionData.assistantSharing)
    await provisionAssistantSharing(provisionData.assistantSharing)
  if (provisionData.parameters) await provisionParameters(provisionData.parameters)
}
