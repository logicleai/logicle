import { createTool, getTools } from '@/models/tool'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'

export const GET = requireAdmin(async () => {
  const tools = await getTools()
  return ApiResponses.json(tools)
})

export const POST = requireAdmin(async (req: Request) => {
  try {
    const body = (await req.json()) as dto.InsertableToolDTO
    const created = await createTool(body)
    return ApiResponses.created(created)
  } catch {
    return ApiResponses.internalServerError('Creation failed')
  }
})
