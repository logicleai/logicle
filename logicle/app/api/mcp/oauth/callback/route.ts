import { operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { exchangeMcpOAuthCode } from '@/lib/tools/mcp/oauth'
import { getTool } from '@/models/tool'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { upsertUserSecret } from '@/models/userSecrets'
import { MCP_OAUTH_SECRET_TYPE } from '@/lib/userSecrets/constants'
import { NextResponse } from 'next/server'
import env from '@/lib/env'
import { getMcpOAuthSession } from '@/lib/auth/mcpOauth'

const renderHtml = (payload: Record<string, unknown>) => {
  const data = JSON.stringify(payload)
  const targetOrigin = JSON.stringify(new URL(env.appUrl).origin)
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
            window.opener.postMessage(data, ${targetOrigin});
          } else if (data?.returnUrl) {
            window.location.replace(data.returnUrl);
            return;
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

const appOrigin = new URL(env.appUrl).origin

const resolveReturnUrl = (candidate?: string | null) => {
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.origin === appOrigin ? url.toString() : undefined
  } catch {
    return undefined
  }
}

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
      const oauthSession = await getMcpOAuthSession()
      if (!oauthSession.state || oauthSession.state !== state) {
        return renderError('Invalid OAuth state')
      }
      if (!oauthSession.toolId || !oauthSession.userId) {
        return renderError('Missing OAuth session')
      }
      const tool = await getTool(oauthSession.toolId)
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
        if (!oauthSession.code_verifier) {
          return renderError('Missing PKCE code verifier')
        }
        const tokenSet = await exchangeMcpOAuthCode(
          config.authentication,
          code,
          redirectUri,
          oauthSession.code_verifier,
          tool.id,
          config.url
        )
        const safeReturnUrl = resolveReturnUrl(oauthSession.returnUrl)
        const returnUrl = safeReturnUrl ?? undefined
        await upsertUserSecret(
          oauthSession.userId,
          tool.id,
          MCP_OAUTH_SECRET_TYPE,
          `MCP OAuth (${tool.name})`,
          JSON.stringify(tokenSet)
        )
        oauthSession.destroy()
        return new NextResponse(
          renderHtml({
            type: 'mcp-oauth-complete',
            toolId: tool.id,
            toolName: tool.name,
            returnUrl,
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
