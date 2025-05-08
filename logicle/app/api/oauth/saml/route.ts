import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'
import { serviceProvider, findSamlIdentityProvider } from '@/lib/saml'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // SP‑initiated AuthnRequest ↪️ IdP
  const clientId = req.nextUrl.searchParams.get('client_id')
  const identityProvider = await findSamlIdentityProvider(clientId!!)
  const loginUrl = await new Promise((resolve, reject) =>
    serviceProvider.create_login_request_url(
      identityProvider,
      {
        relay_state: clientId ?? undefined,
      },
      (err, url) => (err ? reject(err) : resolve(url))
    )
  )
  return NextResponse.redirect(loginUrl as string)
}

export async function POST(req: NextRequest) {
  if (env.saml.useSaml2) {
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
