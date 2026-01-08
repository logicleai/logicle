import { IronSession, SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import * as client from 'openid-client'
import * as dto from '@/types/dto'
import env from '../env'

export interface SessionData {
  idp: string
  code_verifier?: string
  state?: string
}

export const defaultSession: SessionData = {
  idp: 'oidc',
  code_verifier: undefined,
  state: undefined,
}

export const sessionOptions: SessionOptions = {
  password: env.nextAuth.secret,
  cookieName: 'sso_flow_session',
  cookieOptions: {
    secure: env.appUrl.startsWith('https'),
    // Needs to flow on IdP POST/redirects (SAML/OIDC), so allow cross-site with Secure
    sameSite: 'none',
  },
  // Short-lived cookie to hold PKCE/state; refreshed on each init
  ttl: 15 * 60, // 15 minutes
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookiesList = await cookies()
  return await getIronSession<SessionData>(cookiesList as any, sessionOptions)
}

export async function createSession(idp: string): Promise<IronSession<SessionData>> {
  const cookiesList = await cookies()
  const session = await getIronSession<SessionData>(cookiesList as any, sessionOptions)
  session.destroy()
  session.idp = idp
  return session
}

export async function getClientConfig(idp: dto.OIDCConfig) {
  return await client.discovery(new URL(idp.discoveryUrl), idp.clientId)
}
