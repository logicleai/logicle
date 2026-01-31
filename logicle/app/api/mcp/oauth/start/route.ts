import { operation, responseSpec, errorSpec, route, error, notFound } from '@/lib/routes'
import { getTool } from '@/models/tool'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { buildMcpOAuthAuthorizeUrl, createPkcePair } from '@/lib/tools/mcp/oauth'
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMcpOAuthSession } from '@/lib/auth/mcpOauth'
import env from '@/lib/env'

const base64UrlEncode = (input: Buffer) => input.toString('base64url').replace(/=+$/g, '')
const appOrigin = new URL(env.appUrl).origin

const resolveReturnUrl = (candidate: string | null) => {
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
    name: 'McpOauthStart',
    description: 'Start MCP OAuth flow for a tool.',
    authentication: 'user',
    preventCrossSite: true,
    responses: [responseSpec(302), errorSpec(400), errorSpec(404)] as const,
    implementation: async (req: Request, _params, { session }) => {
      const url = new URL(req.url)
      const toolId = url.searchParams.get('toolId')
      const returnUrl = resolveReturnUrl(url.searchParams.get('returnUrl'))
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
        const oauthSession = await getMcpOAuthSession()
        const { codeVerifier, codeChallenge } = createPkcePair()
        const state = base64UrlEncode(crypto.randomBytes(32))
        oauthSession.userId = session.userId
        oauthSession.toolId = tool.id
        oauthSession.state = state
        oauthSession.code_verifier = codeVerifier
        oauthSession.issuedAt = new Date().toISOString()
        oauthSession.returnUrl = returnUrl
        await oauthSession.save()
        const { url: authorizationUrl } = await buildMcpOAuthAuthorizeUrl(
          state,
          config.authentication,
          codeChallenge,
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
