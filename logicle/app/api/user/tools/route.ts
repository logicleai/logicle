import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { getTools } from '@/models/tool'
import { getUserWorkspaceMemberships } from '@/models/user'
import * as dto from '@/types/dto'
import { isToolVisible } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  // Fetch prompts
  GET: operation({
    name: 'List tools for user',
    description: 'List tools with visibility for the current user.',
    authentication: 'user',
    responseBodySchema: dto.assistantToolSchema.array(),
    implementation: async (_req: Request, _params, { session }) => {
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
      return tools
    },
  }),
})
