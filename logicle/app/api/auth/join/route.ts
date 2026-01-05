import { createUser, getUserByEmail, getUserCount } from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { PropertySource } from '@/lib/properties'
import env from '@/lib/env'
import { joinRequestSchema } from '@/types/dto/auth'

export const dynamic = 'force-dynamic'

// Signup the user
export async function POST(req: Request) {
  const result = joinRequestSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const joinRequest = result.data
  const existingUser = await getUserByEmail(joinRequest.email)

  if (existingUser) {
    return ApiResponses.error(400, 'An user with this email already exists.')
  }

  const userCount = await getUserCount()

  const isSignupEnabled = env.signup.enable && (await PropertySource.signupEnabled())

  // signup is always enabled when there are no users
  if (userCount !== 0 && !isSignupEnabled) {
    return ApiResponses.error(400, 'Signup is not enabled')
  }

  const user = await createUser({
    name: joinRequest.name,
    email: joinRequest.email,
    password: joinRequest.password,
    is_admin: userCount === 0,
    ssoUser: 0,
  })

  return ApiResponses.created(user)
}
