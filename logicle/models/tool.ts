import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

export const toolToDto = (tool: schema.Tool): dto.ToolDTO => {
  return {
    ...tool,
    configuration: JSON.parse(tool.configuration),
  }
}

export const getTools = async (): Promise<dto.ToolDTO[]> => {
  return (await db.selectFrom('Tool').selectAll().execute()).map(toolToDto)
}

export const getToolsFiltered = async (ids: string[]): Promise<dto.ToolDTO[]> => {
  if (ids.length == 0) {
    return []
  }
  const list = await db.selectFrom('Tool').selectAll().where('Tool.id', 'in', ids).execute()
  return list.map(toolToDto)
}

export const getTool = async (toolId: schema.Tool['id']): Promise<dto.ToolDTO | undefined> => {
  const tool = await db.selectFrom('Tool').selectAll().where('id', '=', toolId).executeTakeFirst()
  return tool ? toolToDto(tool) : undefined
}

export const createTool = async (tool: dto.InsertableTool): Promise<dto.ToolDTO> => {
  return await createToolWithId(nanoid(), tool, false)
}

export const createToolWithId = async (
  id: string,
  tool: dto.InsertableTool,
  provisioned: boolean
): Promise<dto.ToolDTO> => {
  const dbTool: schema.Tool = {
    ...tool,
    configuration: JSON.stringify(tool.configuration),
    id: id,
    provisioned: provisioned ? 1 : 0,
    capability: 0,
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

export const updateTool = async (id: string, data: dto.UpdateableTool & { capability: number }) => {
  const update = {
    ...data,
    configuration: data.configuration ? JSON.stringify(data.configuration) : undefined,
  }
  return db.updateTable('Tool').set(update).where('id', '=', id).execute()
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  return db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
}
