import { createUser, getUserByEmail, getUserCount } from '@/models/user'
import { NextResponse } from 'next/server'
import { PropertySource } from '@/lib/properties'
import env from '@/lib/env'
import { joinRequestSchema } from '@/types/dto/auth'

export const dynamic = 'force-dynamic'

// Signup the user
export async function POST(req: Request) {
  const result = joinRequestSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json(
      { error: { message: 'Invalid body', values: result.error.format() } },
      { status: 400 }
    )
  }
  const joinRequest = result.data
  const existingUser = await getUserByEmail(joinRequest.email)

  if (existingUser) {
    return NextResponse.json(
      { error: { message: 'An user with this email already exists.', values: {} } },
      { status: 400 }
    )
  }

  const userCount = await getUserCount()

  const isSignupEnabled = env.signup.enable && (await PropertySource.signupEnabled())

  // signup is always enabled when there are no users
  if (userCount !== 0 && !isSignupEnabled) {
    return NextResponse.json(
      { error: { message: 'Signup is not enabled', values: {} } },
      { status: 400 }
    )
  }

  const user = await createUser({
    name: joinRequest.name,
    email: joinRequest.email,
    password: joinRequest.password,
    is_admin: userCount === 0,
    ssoUser: 0,
  })

  return NextResponse.json(user, { status: 201 })
}
