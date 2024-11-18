import fs from 'fs'
import { InsertableBackend, InsertableToolDTO } from '@/types/dto'
import env from './env'
import { createToolWithId, getTool, updateTool } from '@/models/tool'
import { parseDocument } from 'yaml'
import { createBackendWithId, getBackend, updateBackend } from '@/models/backend'

interface Provision {
  tools: Record<string, InsertableToolDTO>
  backends: Record<string, InsertableBackend>
}

export async function provision() {
  const url = env.provision.source
  if (!url) return
  if (!fs.existsSync(url)) {
    //throw new Error(`No provisioning file at ${url}`)
  }
  const content = fs.readFileSync(url)
  const provisionData = parseDocument(content.toString('utf-8')).toJSON() as Provision
  for (const id in provisionData.tools) {
    const toolDef = provisionData.tools[id]
    const existing = await getTool(id)
    if (existing) {
      updateTool(id, toolDef)
    } else {
      createToolWithId(id, toolDef, true)
    }
  }
  for (const id in provisionData.backends) {
    const backendDef = provisionData.backends[id]
    const existing = await getBackend(id)
    if (existing) {
      updateBackend(id, backendDef)
    } else {
      createBackendWithId(id, backendDef, true)
    }
  }
}
