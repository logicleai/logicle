import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'
import { getOrCreateImageFromDataUri } from './images'

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

const toolWorkspaceSharingData = async (toolIds: string[]): Promise<Map<string, string[]>> => {
  if (toolIds.length === 0) {
    return new Map()
  }

  const sharingList = await db
    .selectFrom('ToolSharing')
    .selectAll()
    .where('ToolSharing.toolId', 'in', toolIds)
    .execute()

  // Group by assistantId in one pass:
  const grouped = sharingList.reduce<Record<string, string[]>>((acc, s) => {
    if (!(s.toolId in acc)) {
      acc[s.toolId] = []
    }
    const entry = acc[s.toolId]
    entry.push(s.workspaceId)
    return acc
  }, {})

  // Turn the plain object into a Map<string, dto.Sharing[]>
  return new Map(Object.entries(grouped))
}

export const makeSharing = (type: string, workspaces: string[]): dto.Sharing2 => {
  if (type === 'public') {
    return { type: 'public' }
  } else if (type === 'workspace') {
    return { type: 'workspace', workspaces: workspaces }
  } else {
    return { type: 'private' }
  }
}

export const toolsToDtos = async (tools: schema.Tool[]): Promise<dto.Tool[]> => {
  const sharingData = await toolWorkspaceSharingData(tools.map((t) => t.id))
  return tools.map((tool) => {
    const { imageId, ...toolWithoutImage } = tool
    return {
      ...toolWithoutImage,
      provisioned: !!toolWithoutImage.provisioned,
      capability: !!toolWithoutImage.capability,
      icon: tool.imageId == null ? null : `/api/images/${tool.imageId}`,
      tags: JSON.parse(tool.tags),
      configuration: JSON.parse(tool.configuration),
      sharing: makeSharing(tool.sharing, sharingData.get(tool.id) ?? []),
      satelliteId: tool.satelliteId,
      enabled: !!tool.enabled,
    }
  })
}

export const getBuildableTools = async (): Promise<BuildableTool[]> => {
  return (await db.selectFrom('Tool').selectAll().execute()).map(dbToolToBuildableTool)
}

export const getTools = async (): Promise<dto.Tool[]> => {
  return toolsToDtos(await db.selectFrom('Tool').selectAll().execute())
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
    satelliteId: null,
    enabled: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sharing: tool.sharing.type,
  }

  await db.insertInto('Tool').values(dbTool).executeTakeFirstOrThrow()
  await updateWorkspaceSharing(id, tool.sharing)
  await transferFilesToToolOwner(id, tool.configuration, ownerUserId)
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

const updateWorkspaceSharing = async (toolId: string, sharing: dto.Sharing2) => {
  await db.deleteFrom('ToolSharing').where('toolId', '=', toolId).execute()
  if (sharing.type === 'workspace' && sharing.workspaces.length !== 0) {
    await db
      .insertInto('ToolSharing')
      .values(
        sharing.workspaces.map((workspace) => {
          return {
            id: nanoid(),
            toolId,
            workspaceId: workspace,
          }
        })
      )
      .execute()
  }
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
    sharing: sharing?.type,
  }
  await db.updateTable('Tool').set(update).where('id', '=', toolId).execute()
  if (data.configuration) {
    await transferFilesToToolOwner(toolId, data.configuration, ownerUserId)
  }
  if (data.sharing) {
    await updateWorkspaceSharing(toolId, data.sharing)
  }
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  return db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
}

export const updateToolSatelliteInfo = async (
  toolId: string,
  satelliteId: string,
  enabled: boolean
): Promise<void> => {
  await db
    .updateTable('Tool')
    .set({
      satelliteId,
      enabled: enabled ? 1 : 0,
    })
    .where('id', '=', toolId)
    .execute()
}
