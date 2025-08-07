import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'
import { getOrCreateImageFromDataUri } from './images'

export interface BuildableTool {
  type: string
  configuration: Record<string, unknown>
  promptFragment: string
  provisioned: boolean
}

const toolToDto = (tool: schema.Tool): dto.Tool => {
  const { imageId, ...toolWithoutImage } = tool
  return {
    ...toolWithoutImage,
    icon: tool.imageId == null ? null : `/api/images/${tool.imageId}`,
    tags: JSON.parse(tool.tags),
    configuration: JSON.parse(tool.configuration),
    sharing: {
      type: 'public',
    },
  }
}

export const dbToolToBuildableTool = (tool: schema.Tool): BuildableTool => {
  return {
    type: tool.type,
    configuration: JSON.parse(tool.configuration),
    promptFragment: tool.promptFragment,
    provisioned: tool.provisioned ? true : false,
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
    const entry = (acc[s.toolId] ??= [])
    entry.push(s.workspaceId)
    return acc
  }, {})

  // Turn the plain object into a Map<string, dto.Sharing[]>
  return new Map(Object.entries(grouped))
}

export const makeSharing = (type: string, workspaces: string[]): dto.Sharing2 => {
  if (type == 'public') {
    return { type: 'public' }
  } else if (type == 'workspace') {
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
      icon: tool.imageId == null ? null : `/api/images/${tool.imageId}`,
      tags: JSON.parse(tool.tags),
      configuration: JSON.parse(tool.configuration),
      sharing: makeSharing(tool.sharing, sharingData.get(tool.id) ?? []),
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
  if (ids.length == 0) {
    return []
  }
  const list = await db.selectFrom('Tool').selectAll().where('Tool.id', 'in', ids).execute()
  return list.map(dbToolToBuildableTool)
}

export const getTool = async (toolId: schema.Tool['id']): Promise<dto.Tool | undefined> => {
  const list = await db.selectFrom('Tool').selectAll().where('id', '=', toolId).execute()
  return (await toolsToDtos(list)).find((t) => t.id == toolId)
}

export const createTool = async (tool: dto.InsertableTool): Promise<dto.Tool> => {
  return await createToolWithId(nanoid(), tool)
}

export const createToolWithId = async (
  id: string,
  tool: dto.InsertableTool,
  capability?: boolean,
  provisioned?: boolean
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
    sharing: tool.sharing.type,
  }

  await db.insertInto('Tool').values(dbTool).executeTakeFirstOrThrow()
  await updateWorkspaceSharing(id, tool.sharing)
  const created = await getTool(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

const updateWorkspaceSharing = async (toolId: string, sharing: dto.Sharing2) => {
  await db.deleteFrom('ToolSharing').where('toolId', '=', toolId).execute()
  if (sharing.type == 'workspace' && sharing.workspaces.length != 0) {
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
  capability?: boolean
) => {
  const { icon, sharing, ...toolTableFields } = data
  const imageId = icon == null ? icon : await getOrCreateImageFromDataUri(icon)

  const update: Partial<schema.Tool> = {
    ...toolTableFields,
    imageId,
    configuration: data.configuration ? JSON.stringify(data.configuration) : undefined,
    capability: capability !== undefined ? (capability ? 1 : 0) : undefined,
    tags: data.tags ? JSON.stringify(data.tags) : undefined,
    sharing: sharing?.type,
  }
  await db.updateTable('Tool').set(update).where('id', '=', toolId).execute()
  if (data.sharing) {
    await updateWorkspaceSharing(toolId, data.sharing)
  }
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  return db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
}
