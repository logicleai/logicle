import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'
import { getOrCreateImageFromDataUri } from './images'

export const toolToDto = (tool: schema.Tool): dto.Tool => {
  const { imageId, ...toolWithoutImage } = tool
  return {
    ...toolWithoutImage,
    icon: tool.imageId == null ? null : `/api/images/${tool.imageId}`,
    tags: JSON.parse(tool.tags),
    configuration: JSON.parse(tool.configuration),
  }
}

export const getTools = async (): Promise<dto.Tool[]> => {
  return (await db.selectFrom('Tool').selectAll().execute()).map(toolToDto)
}

export const getToolsFiltered = async (ids: string[]): Promise<dto.Tool[]> => {
  if (ids.length == 0) {
    return []
  }
  const list = await db.selectFrom('Tool').selectAll().where('Tool.id', 'in', ids).execute()
  return list.map(toolToDto)
}

export const getTool = async (toolId: schema.Tool['id']): Promise<dto.Tool | undefined> => {
  const tool = await db.selectFrom('Tool').selectAll().where('id', '=', toolId).executeTakeFirst()
  return tool ? toolToDto(tool) : undefined
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
  }

  await db.insertInto('Tool').values(dbTool).executeTakeFirstOrThrow()
  const created = await getTool(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateTool = async (id: string, data: dto.UpdateableTool, capability?: boolean) => {
  const { icon, ...withoutIcon } = data
  const imageId = icon == null ? icon : await getOrCreateImageFromDataUri(icon)

  const update: Partial<schema.Tool> = {
    ...withoutIcon,
    imageId,
    configuration: data.configuration ? JSON.stringify(data.configuration) : undefined,
    capability: capability !== undefined ? (capability ? 1 : 0) : undefined,
    tags: data.tags ? JSON.stringify(data.tags) : undefined,
  }
  return db.updateTable('Tool').set(update).where('id', '=', id).execute()
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  return db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
}
