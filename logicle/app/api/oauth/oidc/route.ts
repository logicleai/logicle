import jackson from '@/lib/jackson'
import { OIDCAuthzResponsePayload } from '@boxyhq/saml-jackson'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { oauthController } = await jackson()
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const { redirect_url } = await oauthController.oidcAuthzResponse(
    params as OIDCAuthzResponsePayload
  )

  if (!redirect_url) {
    throw new Error('No redirect URL found.')
  }
  return NextResponse.redirect(redirect_url)
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
