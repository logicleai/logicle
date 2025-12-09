import { IronSession, SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import * as client from 'openid-client'
import * as dto from '@/types/dto'

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
  password: 'complex_password_at_least_32_characters_long',
  cookieName: 'next_js_session',
  cookieOptions: {
    // secure only works in `https` environments
    // if your localhost is not on `https`, then use: `secure: process.env.NODE_ENV === "production"`
    secure: process.env.NODE_ENV === 'production',
  },
  ttl: 60 * 60 * 24 * 7, // 1 week
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
