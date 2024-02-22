import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handleAuthorize(req)
}
export async function GET(req: NextRequest) {
  return handleAuthorize(req)
}

async function handleAuthorize(req: NextRequest) {
  const { oauthController } = await jackson()

  const requestParams =
    req.method === 'GET'
      ? Object.fromEntries(req.nextUrl.searchParams.entries())
      : (req.body as any)

  const { redirect_url, authorize_form } = await oauthController.authorize(requestParams)

  if (redirect_url) {
    return NextResponse.redirect(redirect_url)
  } else {
    return new NextResponse(authorize_form, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}
