import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import {
  deleteKnowledgeBox,
  isKnowledgeBoxType,
  syncKnowledgeBoxConfiguration,
} from '@/backend/lib/knowledge/lifecycle'
import * as schema from '@/db/schema'
import { getOrCreateImageFromDataUri } from './images'
import {
  createPermissionTargetAnd,
  deletePermissionTarget,
  filterVisiblePermissionTargetKeys,
  getPermissionTargetsSharing,
  toolPermissionTarget,
  updatePermissionTargetSharing,
} from './permissionTarget'

export interface BuildableTool {
  id: string
  name: string
  type: string
  configuration: Record<string, unknown>
  promptFragment: string
  provisioned: boolean
}

export const dbToolToBuildableTool = (tool: schema.Tool): BuildableTool => {
  return {
    id: tool.id,
    name: tool.name,
    type: tool.type,
    configuration: JSON.parse(tool.configuration),
    promptFragment: tool.promptFragment,
    provisioned: !!tool.provisioned,
  }
}

export type ToolAccessPrincipal = { userId: string; userRole?: schema.UserRole }

/** Which of the given tool ids are visible to this user: public tools to
 * anyone, workspace tools to members of a sharing workspace, private tools
 * to admins only. Tools attached to an assistant/sub-assistant/evaluate
 * request must always be filtered through this before being built or
 * exposed to a run, since a tool a user can't see may hold server-side
 * credentials. */
export const filterVisibleToolIds = async (
  user: ToolAccessPrincipal,
  toolIds: string[]
): Promise<Set<string>> => {
  const uniqueIds = [...new Set(toolIds)]
  if (uniqueIds.length === 0) {
    return new Set()
  }
  const tools = await db.selectFrom('Tool').select(['id']).where('id', 'in', uniqueIds).execute()
  const refs = tools.map((tool) => toolPermissionTarget(tool.id))
  const visibleResourceKeys = await filterVisiblePermissionTargetKeys(user, refs)
  return new Set(tools.filter((tool) => visibleResourceKeys.has(tool.id)).map((tool) => tool.id))
}

export const canUserAccessTool = async (
  user: ToolAccessPrincipal,
  toolId: string
): Promise<boolean> => {
  return (await filterVisibleToolIds(user, [toolId])).has(toolId)
}

export const toolsToDtos = async (tools: schema.Tool[]): Promise<dto.Tool[]> => {
  const refs = tools.map((tool) => toolPermissionTarget(tool.id))
  const sharingData = await getPermissionTargetsSharing(refs)
  return tools.map((tool) => {
    const { imageId, ...toolWithoutImage } = tool
    return {
      ...toolWithoutImage,
      provisioned: !!toolWithoutImage.provisioned,
      capability: !!toolWithoutImage.capability,
      icon: tool.imageId == null ? null : `/api/images/${tool.imageId}`,
      tags: JSON.parse(tool.tags),
      configuration: JSON.parse(tool.configuration),
      sharing: sharingData.get(tool.id) ?? { type: 'private' },
    }
  })
}

export const getBuildableTools = async (): Promise<BuildableTool[]> => {
  return (await db.selectFrom('Tool').selectAll().execute()).map(dbToolToBuildableTool)
}

export const getTools = async (): Promise<dto.Tool[]> => {
  const tools = await db.selectFrom('Tool').selectAll().execute()
  return toolsToDtos(tools)
}

export const getToolsFiltered = async (ids: string[]): Promise<BuildableTool[]> => {
  if (ids.length === 0) {
    return []
  }
  const list = await db.selectFrom('Tool').selectAll().where('Tool.id', 'in', ids).execute()
  return list.map(dbToolToBuildableTool)
}

export const getTool = async (toolId: schema.Tool['id']): Promise<dto.Tool | undefined> => {
  const list = await db.selectFrom('Tool').selectAll().where('id', '=', toolId).execute()
  return (await toolsToDtos(list)).find((t) => t.id === toolId)
}

export const createTool = async (
  tool: dto.InsertableTool,
  ownerUserId?: string
): Promise<dto.Tool> => {
  return await createToolWithId(nanoid(), tool, undefined, undefined, ownerUserId)
}

export const createToolWithId = async (
  id: string,
  tool: dto.InsertableTool,
  capability?: boolean,
  provisioned?: boolean,
  ownerUserId?: string
): Promise<dto.Tool> => {
  const { icon, ...toolWithoutIcon } = tool
  const dbTool: schema.Tool = {
    ...toolWithoutIcon,
    imageId: icon == null ? null : await getOrCreateImageFromDataUri(icon),
    configuration: JSON.stringify(tool.configuration),
    tags: JSON.stringify(tool.tags),
    id: id,
    provisioned: provisioned ? 1 : 0,
    capability: capability ? 1 : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await createPermissionTargetAnd(toolPermissionTarget(id), tool.sharing, async (trx) => {
    await trx.insertInto('Tool').values(dbTool).executeTakeFirstOrThrow()
    return undefined
  })
  await transferFilesToToolOwner(id, tool.configuration, ownerUserId)
  await syncKnowledgeBoxConfiguration(id, tool.type, tool.configuration)
  const created = await getTool(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

const transferFilesToToolOwner = async (
  toolId: string,
  configuration: Record<string, unknown>,
  ownerUserId?: string
) => {
  const rawFiles = configuration.files
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) return
  const fileIds = rawFiles
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (fileIds.length === 0) return

  let query = db
    .updateTable('File')
    .set({ ownerType: 'TOOL', ownerId: toolId })
    .where('id', 'in', [...new Set(fileIds)])

  if (ownerUserId) {
    query = query.where('ownerType', '=', 'USER').where('ownerId', '=', ownerUserId)
  }

  await query.execute()
}

export const updateTool = async (
  toolId: string,
  data: dto.UpdateableTool,
  capability?: boolean,
  ownerUserId?: string
) => {
  const { icon, sharing, ...toolTableFields } = data
  const imageId = icon == null ? icon : await getOrCreateImageFromDataUri(icon)

  const update: Partial<schema.Tool> = {
    ...toolTableFields,
    updatedAt: new Date().toISOString(),
    imageId,
    configuration: data.configuration ? JSON.stringify(data.configuration) : undefined,
    capability: capability !== undefined ? (capability ? 1 : 0) : undefined,
    tags: data.tags ? JSON.stringify(data.tags) : undefined,
  }
  await db.updateTable('Tool').set(update).where('id', '=', toolId).execute()
  if (data.configuration) {
    await transferFilesToToolOwner(toolId, data.configuration, ownerUserId)
    const type = await getToolType(toolId)
    if (type) {
      await syncKnowledgeBoxConfiguration(toolId, type, data.configuration)
    }
  }
  if (data.sharing) {
    await updatePermissionTargetSharing(toolId, data.sharing)
  }
}

const getToolType = async (toolId: string): Promise<string | undefined> => {
  const row = await db.selectFrom('Tool').select('type').where('id', '=', toolId).executeTakeFirst()
  return row?.type
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  if (isKnowledgeBoxType((await getToolType(toolId)) ?? '')) {
    await deleteKnowledgeBox(toolId)
  }
  const deleted = await db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
  await deletePermissionTarget(toolId)
  return deleted
}
