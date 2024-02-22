import { deleteTool, getTool, updateTool } from 'models/tool'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async (req: Request, route: { params: { toolId: string } }) => {
  const tool = await getTool(route.params.toolId) // Use the helper function
  if (!tool) {
    return ApiResponses.noSuchEntity()
  }
  return ApiResponses.json(tool)
})

export const PATCH = requireAdmin(async (req: Request, route: { params: { toolId: string } }) => {
  const data = await req.json()
  await updateTool(route.params.toolId, {
    ...data,
    id: undefined,
    type: undefined,
    createdAt: undefined,
    updatedAt: new Date().toISOString(),
  })
  return ApiResponses.success()
})

export const DELETE = requireAdmin(async (req: Request, route: { params: { toolId: string } }) => {
  try {
    await deleteTool(route.params.toolId)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.CANT_UPDATE_DELETE_FOREIGN_KEY
    ) {
      return ApiResponses.foreignKey('Tool is in use')
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})
