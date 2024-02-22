import jackson from '@/lib/jackson'
import { NextRequest, NextResponse } from 'next/server'
import ApiResponses from '../../utils/ApiResponses'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { oauthController } = await jackson()

  let token = req.headers.get('authorization')?.split(' ')[1]

  if (!token) {
    let arr: string[] = []
    const accessToken = req.nextUrl.searchParams.get('access_token')
    arr = arr.concat(accessToken ?? '')

    if (arr[0].length > 0) {
      token = arr[0]
    }
  }

  if (!token) {
    return ApiResponses.notAuthorized('Unauthorized')
  }

  const profile = await oauthController.userInfo(token)

  return NextResponse.json(profile)
}
