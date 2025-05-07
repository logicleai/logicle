// app/api/auth/login/saml/route.js
import { NextResponse } from 'next/server'
import { serviceProvider, identityProvider } from '@/lib/saml'

export async function GET() {
  // SP‑initiated AuthnRequest ↪️ IdP
  const loginUrl = await new Promise((resolve, reject) =>
    serviceProvider.create_login_request_url(identityProvider, {}, (err, url) =>
      err ? reject(err) : resolve(url)
    )
  )
  return NextResponse.redirect(loginUrl as string)
}

export async function POST(request) {
  // Parse the raw SAML POST
  const form = await request.formData()
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
}
