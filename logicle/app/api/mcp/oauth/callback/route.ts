import { operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { verifyMcpOAuthState, exchangeMcpOAuthCode } from '@/lib/tools/mcp/oauth'
import { getTool } from '@/models/tool'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { upsertUserSecret } from '@/models/userSecrets'
import { MCP_OAUTH_SECRET_TYPE } from '@/lib/userSecrets/constants'
import { NextResponse } from 'next/server'
import env from '@/lib/env'

const renderHtml = (payload: Record<string, unknown>) => {
  const data = JSON.stringify(payload)
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MCP OAuth</title>
  </head>
  <body>
    <script>
      (function () {
        try {
          const data = ${data};
          if (window.opener) {
            window.opener.postMessage(data, '*');
          }
        } catch (e) {}
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`
}

const renderError = (message: string, status = 400) =>
  new NextResponse(renderHtml({ type: 'mcp-oauth-error', error: message }), {
    status,
    headers: { 'content-type': 'text/html' },
  })

export const { GET } = route({
  GET: operation({
    name: 'McpOauthCallback',
    description: 'Handle MCP OAuth callback.',
    authentication: 'public',
    responses: [responseSpec(200), errorSpec(400), errorSpec(404)] as const,
    implementation: async (req: Request) => {
      const url = new URL(req.url)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const errorParam = url.searchParams.get('error')
      if (errorParam) {
        return renderError(errorParam)
      }
      if (!code || !state) {
        return renderError('Missing code or state')
      }
      const statePayload = verifyMcpOAuthState(state)
      if (!statePayload) {
        return renderError('Invalid OAuth state')
      }
      const tool = await getTool(statePayload.toolId)
      if (!tool || tool.type !== 'mcp') {
        return renderError('Tool not found', 404)
      }
      const parsed = mcpPluginSchema.safeParse(tool.configuration)
      if (!parsed.success) {
        return renderError('Invalid tool configuration')
      }
      const config = parsed.data
      if (config.authentication.type !== 'oauth') {
        return renderError('Tool does not use OAuth authentication')
      }
      const redirectUri = `${env.appUrl}/api/mcp/oauth/callback`
      try {
      const tokenSet = await exchangeMcpOAuthCode(
        config.authentication,
        code,
        redirectUri,
        config.url
      )
        await upsertUserSecret(
          statePayload.userId,
          tool.id,
          MCP_OAUTH_SECRET_TYPE,
          `MCP OAuth (${tool.name})`,
          JSON.stringify(tokenSet)
        )
        return new NextResponse(
          renderHtml({
            type: 'mcp-oauth-complete',
            toolId: tool.id,
            toolName: tool.name,
          }),
          {
            headers: { 'content-type': 'text/html' },
          }
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth exchange failed'
        return renderError(message)
      }
    },
  }),
})
