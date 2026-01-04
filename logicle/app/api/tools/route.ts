import { createTool, getTools } from '@/models/tool'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import { insertableToolSchema } from '@/types/validation/tool'
import { DropTypeNode } from 'kysely'

export const GET = requireAdmin(async () => {
  const tools = await getTools()
  return ApiResponses.json(tools)
})

export const POST = requireAdmin(async (req: Request) => {
  try {
    const result = insertableToolSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    const created = await createTool(result.data)
    return ApiResponses.created(created)
  } catch (e) {
    logger.error('Tool creation failed', e)
    return ApiResponses.internalServerError('Creation failed')
  }
})
