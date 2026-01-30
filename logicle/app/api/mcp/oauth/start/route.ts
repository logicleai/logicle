import { operation, responseSpec, errorSpec, route, error, notFound } from '@/lib/routes'
import { getTool } from '@/models/tool'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { buildMcpOAuthAuthorizeUrl } from '@/lib/tools/mcp/oauth'
import { NextResponse } from 'next/server'

export const { GET } = route({
  GET: operation({
    name: 'McpOauthStart',
    description: 'Start MCP OAuth flow for a tool.',
    authentication: 'user',
    responses: [responseSpec(302), errorSpec(400), errorSpec(404)] as const,
    implementation: async (req: Request, _params, { session }) => {
      const url = new URL(req.url)
      const toolId = url.searchParams.get('toolId')
      if (!toolId) {
        return error(400, 'Missing toolId')
      }
      const tool = await getTool(toolId)
      if (!tool || tool.type !== 'mcp') {
        return notFound('Tool not found')
      }
      const parsed = mcpPluginSchema.safeParse(tool.configuration)
      if (!parsed.success) {
        return error(400, 'Invalid tool configuration')
      }
      const config = parsed.data
      if (config.authentication.type !== 'oauth') {
        return error(400, 'Tool does not use OAuth authentication')
      }
      try {
        const { url: authorizationUrl } = await buildMcpOAuthAuthorizeUrl(
          session.userId,
          tool.id,
          config.authentication,
          config.url
        )
        return NextResponse.redirect(authorizationUrl)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth discovery failed'
        return error(400, message)
      }
    },
  }),
})
