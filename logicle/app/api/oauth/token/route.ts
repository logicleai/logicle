import jackson from '@/lib/jackson'
import { OAuthTokenReq } from '@boxyhq/saml-jackson'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { oauthController } = await jackson()

  const data = await req.formData()
  const formDataObj = {}
  data.forEach((value, key) => (formDataObj[key] = value))

  const token = await oauthController.token(formDataObj as OAuthTokenReq)
  return NextResponse.json(token)
}
