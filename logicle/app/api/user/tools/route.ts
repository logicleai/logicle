import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '../../utils/auth'
import { getTools } from '@/models/tool'
import { getUserWorkspaceMemberships } from '@/models/user'
import * as dto from '@/types/dto'
import { isToolVisible } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Fetch prompts
export const GET = requireSession(async (session) => {
  const workspaceMemberships = await getUserWorkspaceMemberships(session.userId)
  const tools = (await getTools()).map((tool) => {
    return {
      id: tool.id,
      name: tool.name,
      provisioned: tool.provisioned,
      capability: tool.capability,
      visible: isToolVisible(
        tool,
        session.userRole,
        workspaceMemberships.map((m) => m.id)
      ),
    } satisfies dto.AssistantTool
  })
  return ApiResponses.json(tools)
})
