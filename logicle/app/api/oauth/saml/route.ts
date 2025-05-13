import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
