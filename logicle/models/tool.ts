import { db } from 'db/database'
import { InsertableToolDTO, ToolDTO, UpdateableToolDTO } from '@/types/dto'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

export const toolToDto = (tool: schema.Tool): ToolDTO => {
  return {
    ...tool,
    configuration: JSON.parse(tool.configuration),
  }
}

export const getTools = async (): Promise<ToolDTO[]> => {
  return (await db.selectFrom('Tool').selectAll().execute()).map(toolToDto)
}

export const getToolsFiltered = async (ids: string[]): Promise<ToolDTO[]> => {
  if (ids.length == 0) {
    return []
  }
  const list = await db.selectFrom('Tool').selectAll().where('Tool.id', 'in', ids).execute()
  return list.map(toolToDto)
}

export const getTool = async (toolId: schema.Tool['id']): Promise<ToolDTO | undefined> => {
  const tool = await db.selectFrom('Tool').selectAll().where('id', '=', toolId).executeTakeFirst()
  return tool ? toolToDto(tool) : undefined
}

export const createTool = async (tool: InsertableToolDTO): Promise<ToolDTO> => {
  const id = nanoid()
  await db
    .insertInto('Tool')
    .values({
      ...tool,
      configuration: JSON.stringify(tool.configuration),
      id: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .executeTakeFirstOrThrow()
  const created = await getTool(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateTool = async (id: string, data: UpdateableToolDTO) => {
  const update = {
    ...data,
    configuration: data.configuration ? JSON.stringify(data.configuration) : undefined,
  }
  return db.updateTable('Tool').set(update).where('id', '=', id).execute()
}

export const deleteTool = async (toolId: schema.Tool['id']) => {
  return db.deleteFrom('Tool').where('id', '=', toolId).executeTakeFirstOrThrow()
}
