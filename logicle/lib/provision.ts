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
import { createAssistantWithId, getAssistant, updateAssistant } from '@/models/assistant'
import { AssistantSharing } from '@/db/schema'
import { db } from '@/db/database'

interface Provision {
  tools: Record<string, dto.InsertableToolDTO>
  backends: Record<string, dto.InsertableBackend>
  users: Record<string, dto.InsertableUser>
  apiKeys: Record<string, dto.InsertableApiKey>
  assistants: Record<string, dto.InsertableAssistant>
  assistantSharing: Record<string, AssistantSharing>
}

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

export async function provisionFile(path: string) {
  logger.info(`provisioning from file ${path}`)
  const content = fs.readFileSync(path)
  const provisionData = parseDocument(content.toString('utf-8')).toJSON() as Provision
  for (const id in provisionData.tools) {
    const provisioned = provisionData.tools[id]
    const existing = await getTool(id)
    if (existing) {
      await updateTool(id, provisioned)
    } else {
      await createToolWithId(id, provisioned, true)
    }
  }
  for (const id in provisionData.backends) {
    const provisioned = provisionData.backends[id]
    const existing = await getBackend(id)
    if (existing) {
      await updateBackend(id, provisioned)
    } else {
      await createBackendWithId(id, provisioned, true)
    }
  }
  for (const id in provisionData.users) {
    const provisioned = provisionData.users[id]
    const existing = await getUserById(id)
    if (existing) {
      await updateUser(id, provisioned)
    } else {
      await createUserRawWithId(id, provisioned, true)
    }
  }
  for (const id in provisionData.apiKeys) {
    const provisioned = provisionData.apiKeys[id]
    const existing = await getApiKey(id)
    if (existing) {
      await updateApiKey(id, provisioned)
    } else {
      await createApiKeyWithId(id, provisioned, true)
    }
  }
  for (const id in provisionData.assistants) {
    const provisioned = {
      ...provisionData.assistants[id],
      files: [],
    }
    const existing = await getAssistant(id)
    if (existing) {
      await updateAssistant(id, provisioned)
    } else {
      await createAssistantWithId(id, provisioned, true)
    }
  }
  for (const id in provisionData.assistantSharing) {
    const provisioned = {
      ...provisionData.assistantSharing[id],
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
