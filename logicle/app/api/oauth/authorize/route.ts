import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'
import ApiErrors from '../../utils/ApiErrors'
import { findIdentityProvider, serviceProvider } from '@/lib/saml'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handleAuthorize(req)
}
export async function GET(req: NextRequest) {
  return handleAuthorize(req)
}

async function handleAuthorize(req: NextRequest) {
  if (env.useBoxyHq) {
    const { oauthController } = await jackson()

    const requestParams =
      req.method === 'GET'
        ? Object.fromEntries(req.nextUrl.searchParams.entries())
        : await req.json()

    const { redirect_url, authorize_form } = await oauthController.authorize(requestParams)

    if (redirect_url) {
      return NextResponse.redirect(redirect_url)
    } else {
      return new NextResponse(authorize_form, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
  } else {
    // SP‑initiated AuthnRequest ↪️ IdP
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) {
      return ApiErrors.invalidParameter(`Missing / Invalid client_id parameter`)
    }

    const identityProvider = await findIdentityProvider(clientId)
    if (!identityProvider) {
      return ApiErrors.invalidParameter(`No such client_id: ${clientId}`)
    }
    if (identityProvider.type == 'SAML') {
      const loginUrl = await new Promise((resolve, reject) =>
        serviceProvider.create_login_request_url(
          identityProvider.identityProvider,
          {
            relay_state: clientId ?? undefined,
          },
          (err, url) => (err ? reject(err) : resolve(url))
        )
      )
      return NextResponse.redirect(loginUrl as string)
    } else if (identityProvider.type == 'OIDC') {
      let discoveryDoc: any
      try {
        // 2. Fetch the discovery document
        const res = await fetch(identityProvider.identityProvider.discoveryUrl)
        if (!res.ok) {
          throw new Error(`Failed to fetch discovery document: ${res.status}`)
        }
        discoveryDoc = await res.json()
      } catch (error) {
        console.error('OIDC discovery fetch error:', error)
        return NextResponse.json({ error: 'Unable to fetch OIDC configuration' }, { status: 500 })
      }
      const authorizationEndpoint: string = discoveryDoc.authorization_endpoint
      const scope = 'openid email profile'
      const params = new URLSearchParams({
        client_id: identityProvider.identityProvider.clientId,
        scope,
        response_type: 'code',
        redirect_uri: `${env.oidc.redirectUrl}`,
        state: clientId,
      })
      return NextResponse.redirect(`${authorizationEndpoint}?${params.toString()}`)
    }
  }
}
