import { NextResponse } from 'next/server'
import { getUserById } from 'models/user'
import { requireSession } from '../../utils/auth'
import { Session } from 'next-auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session: Session) => {
  const user = await getUserById(session.user.id)
  const img = user?.image ?? ''
  return new NextResponse(img)
})
