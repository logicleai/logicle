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
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #111827; }
      .card { max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      .title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
      .message { color: #6b7280; font-size: 14px; }
      .error { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-top: 12px; white-space: pre-wrap; }
      .actions { margin-top: 16px; display: flex; gap: 8px; }
      button { background: #111827; color: #fff; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
      button.secondary { background: #f3f4f6; color: #111827; }
    </style>
  </head>
  <body>
    <script>
      (function () {
        try {
          const data = ${data};
          if (window.opener) {
            window.opener.postMessage(data, ${targetOrigin});
          }
          if (data?.type === 'mcp-oauth-complete') {
            if (!window.opener && data?.returnUrl) {
              window.location.replace(data.returnUrl);
              return;
            }
            window.close();
            return;
          }
        } catch (e) {}
      })();
    </script>
    <div class="card">
      <div class="title">MCP OAuth</div>
      <div class="message">You can close this window when you are done.</div>
      <div id="error" class="error" style="display:none;"></div>
      <div class="actions">
        <button id="close-btn" onclick="window.close()">Close</button>
        <button id="back-btn" class="secondary" onclick="window.history.back()" style="display:none;">Go back</button>
      </div>
    </div>
    <script>
      (function () {
        try {
          const data = ${data};
          if (data?.type === 'mcp-oauth-error' && data?.error) {
            const errorEl = document.getElementById('error');
            if (errorEl) {
              errorEl.textContent = String(data.error);
              errorEl.style.display = 'block';
            }
          }
          const canClose = !!window.opener || window.history.length === 1;
          const closeBtn = document.getElementById('close-btn');
          const backBtn = document.getElementById('back-btn');
          if (!window.opener && window.history.length > 1) {
            if (closeBtn) closeBtn.style.display = 'none';
            if (backBtn) backBtn.style.display = 'inline-block';
          }
        } catch (e) {}
      })();
    </script>
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
          tool.id,
          config.authentication,
          code,
          redirectUri,
          config.url,
          oauthSession.code_verifier
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
