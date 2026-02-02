import { IronSession, SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import env from '../env'

export interface McpOAuthSessionData {
  userId: string
  toolId: string
  state: string
  code_verifier?: string
  issuedAt?: string
  returnUrl?: string
}

export const sessionOptions: SessionOptions = {
  password: env.nextAuth.secret,
  cookieName: 'mcp_oauth_session',
  cookieOptions: {
    secure: env.appUrl.startsWith('https'),
    // Only use SameSite=None when Secure is true (required by browsers).
    sameSite: env.appUrl.startsWith('https') ? 'none' : 'lax',
  },
  // Short-lived cookie for OAuth state/PKCE data.
  ttl: 15 * 60, // 15 minutes
}

export async function getMcpOAuthSession(): Promise<IronSession<McpOAuthSessionData>> {
  const cookiesList = await cookies()
  return await getIronSession<McpOAuthSessionData>(cookiesList as any, sessionOptions)
}
