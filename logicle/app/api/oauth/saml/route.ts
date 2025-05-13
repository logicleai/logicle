import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'
import { serviceProvider, findIdentityProvider } from '@/lib/saml'
import ApiErrors from '../../utils/ApiErrors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  if (!env.useBoxyHq) {
    // Parse the raw SAML POST
    const form = await req.formData()
    const samlBody = Object.fromEntries(form.entries())

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
          JSON.stringify(samlBody)
        )}' />
      </form>
      <script>document.forms[0].submit()</script>
    </body></html>
  `

    const res = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html', 'set-cookie': setCookie },
    })
    return res
  } else {
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
}
