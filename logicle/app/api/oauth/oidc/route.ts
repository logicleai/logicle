import {
  createRemoteJWKSet,
  jwtVerify,
  // or import JWTVerifyResult for typing
} from 'jose'
import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { findIdentityProvider } from '@/lib/saml'
import { OIDCAuthzResponsePayload } from '@boxyhq/saml-jackson'
import { NextRequest, NextResponse } from 'next/server'
import ApiResponses from '../../utils/ApiResponses'
import { getUserByEmail } from '@/models/user'
import { encode as encodeJwt } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (env.useBoxyHq) {
    const { oauthController } = await jackson()
    const params = Object.fromEntries(req.nextUrl.searchParams)
    const { redirect_url } = await oauthController.oidcAuthzResponse(
      params as OIDCAuthzResponsePayload
    )

    if (!redirect_url) {
      throw new Error('No redirect URL found.')
    }
    return NextResponse.redirect(redirect_url)
  } else {
    const state = req.nextUrl.searchParams.get('state')
    if (!state) {
      return ApiResponses.invalidParameter('Missing state')
    }
    const code = req.nextUrl.searchParams.get('code')
    if (!code) {
      return ApiResponses.invalidParameter('Missing code')
    }
    const clientId = state
    const identityProvider = await findIdentityProvider(clientId)
    if (!identityProvider) {
      return ApiResponses.invalidParameter(`No such identity provider: ${clientId}`)
    }
    if (identityProvider.type != 'OIDC') {
      return ApiResponses.invalidParameter(`Identity Provider ${clientId} is not OIDC`)
    }

    // Fetch NextAuth CSRF token + its cookie
    const csrfRes = await fetch(`${process.env.NEXTAUTH_URL}/csrf`, {
      credentials: 'include',
    })
    const body = await csrfRes.json()
    const { csrfToken } = body
    const setCookie = csrfRes.headers.get('set-cookie') || ''

    // Self‑submit into NextAuth callback
    const html = `
    <html><body>
      <form action="/api/auth/callback/saml2" method="POST">
        <input type="hidden" name="csrfToken" value="${csrfToken}" />
        <input type="hidden" name="samlBody"   value='${encodeURIComponent(
          JSON.stringify({
            RelayState: clientId,
            code: code,
          })
        )}' />
      </form>
      <script>document.forms[0].submit()</script>
    </body></html>
  `
    const res = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html', 'set-cookie': setCookie },
    })
    return res
  }
}

export async function POST(req: NextRequest) {
  const { oauthController } = await jackson()

  const formData = await req.formData()
  const RelayState = formData.get('RelayState') as string
  const SAMLResponse = formData.get('SAMLResponse') as string

  const { redirect_url } = await oauthController.samlResponse({
    RelayState,
    SAMLResponse,
  })

  if (!redirect_url) {
    throw new Error('No redirect URL found.')
  }
  return NextResponse.redirect(redirect_url)
}
