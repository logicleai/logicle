import { db } from '@/db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'

function dbToDto(tool: schema.SatelliteTool): dto.SatelliteTool {
  return {
    ...tool,
    inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : undefined,
    outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : undefined,
  }
}

export const getSatelliteTool = async (id: string): Promise<dto.SatelliteTool | undefined> => {
  const result = await db
    .selectFrom('SatelliteTool')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  return result ? dbToDto(result) : undefined
}

export const getSatelliteToolsByIds = async (satelliteId: string): Promise<dto.SatelliteTool[]> => {
  const results = await db
    .selectFrom('SatelliteTool')
    .selectAll()
    .where('satelliteId', '=', satelliteId)
    .execute()
  return results.map(dbToDto)
}

export const createSatelliteTool = async (
  satelliteId: string,
  data: dto.InsertableSatelliteTool
): Promise<dto.SatelliteTool> => {
  const id = nanoid()
  await db
    .insertInto('SatelliteTool')
    .values({
      id,
      satelliteId,
      name: data.name,
      description: data.description || null,
      inputSchema: data.inputSchema ? JSON.stringify(data.inputSchema) : null,
      outputSchema: data.outputSchema ? JSON.stringify(data.outputSchema) : null,
      createdAt: new Date().toISOString(),
    })
    .execute()

  const created = await getSatelliteTool(id)
  if (!created) {
    throw new Error('Failed creating satellite tool')
  }
  return created
}

export const createSatelliteTools = async (
  satelliteId: string,
  tools: dto.InsertableSatelliteTool[]
): Promise<dto.SatelliteTool[]> => {
  return Promise.all(tools.map((tool) => createSatelliteTool(satelliteId, tool)))
}

export const deleteSatelliteTool = async (id: string): Promise<void> => {
  await db.deleteFrom('SatelliteTool').where('id', '=', id).execute()
}

export const deleteSatelliteTools = async (satelliteId: string): Promise<void> => {
  await db.deleteFrom('SatelliteTool').where('satelliteId', '=', satelliteId).execute()
}
