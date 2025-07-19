import { createTool, getTools } from '@/models/tool'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'

export const GET = requireAdmin(async () => {
  const tools = await getTools()
  return ApiResponses.json(tools)
})

export const POST = requireAdmin(async (req: Request) => {
  try {
    const body = (await req.json()) as dto.InsertableTool
    const created = await createTool(body)
    return ApiResponses.created(created)
  } catch (e) {
    logger.error('Tool creation failed', e)
    return ApiResponses.internalServerError('Creation failed')
  }
})
