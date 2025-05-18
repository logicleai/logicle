import { createPrompt, getPrompts } from '@/models/prompt'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'
import { getTools } from '@/models/tool'

export const dynamic = 'force-dynamic'

// Fetch prompts
export const GET = requireSession(async (session) => {
  const tools = (await getTools()).map((t) => {
    return {
      id: t.id,
      name: t.name,
      provisioned: t.provisioned,
      capability: t.capability,
    }
  })
  return ApiResponses.json(tools)
})
