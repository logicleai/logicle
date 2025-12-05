import { IronSession, SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import * as client from 'openid-client'
import { IdentityProvider, OidcIdentityProvider } from './saml'
import { SessionProvider } from 'next-auth/react'

export const clientConfig = {
  //url: process.env.NEXT_PUBLIC_API_URL,
  //audience: process.env.NEXT_PUBLIC_API_URL,
  //client_id: process.env.NEXT_PUBLIC_CLIENT_ID,
  //scope: process.env.NEXT_PUBLIC_SCOPE,
  //redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/openiddict`,
  //post_logout_redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}`,
  //response_type: 'code',
  //grant_type: 'authorization_code',
  //post_login_route: `${process.env.NEXT_PUBLIC_APP_URL}`,
  //code_challenge_method: 'S256',
}

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
  let session = await getIronSession<SessionData>(cookiesList as any, sessionOptions)
  session.destroy()
  session.idp = idp
  return session
}

export async function getClientConfig(idp: OidcIdentityProvider) {
  return await client.discovery(new URL(idp.config.discoveryUrl), idp.config.clientId)
}
