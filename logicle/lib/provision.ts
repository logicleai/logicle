import * as fs from 'fs'
import * as path from 'path'
import * as dto from '@/types/dto'
import env from './env'
import { createToolWithId, getTool, updateTool } from '@/models/tool'
import { parseDocument } from 'yaml'
import { createBackendWithId, getBackend, updateBackend } from '@/models/backend'
import { logger } from './logging'
import { createApiKeyWithId, updateApiKey } from '@/models/apikey'

interface Provision {
  tools: Record<string, dto.InsertableToolDTO>
  backends: Record<string, dto.InsertableBackend>
  apiKeys: Record<string, dto.InsertableApiKey>
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
    const toolDef = provisionData.tools[id]
    const existing = await getTool(id)
    if (existing) {
      await updateTool(id, toolDef)
    } else {
      await createToolWithId(id, toolDef, true)
    }
  }
  for (const id in provisionData.backends) {
    const backendDef = provisionData.backends[id]
    const existing = await getBackend(id)
    if (existing) {
      await updateBackend(id, backendDef)
    } else {
      await createBackendWithId(id, backendDef, true)
    }
  }
  for (const id in provisionData.apiKeys) {
    const provisioned = provisionData.apiKeys[id]
    const existing = await getBackend(id)
    if (existing) {
      await updateApiKey(id, provisioned)
    } else {
      await createApiKeyWithId(id, provisioned, true)
    }
  }
}
