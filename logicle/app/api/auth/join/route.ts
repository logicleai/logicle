import { createUser, getUserByEmail, getUserCount } from 'models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { PropertySource } from '@/lib/properties'

export const dynamic = 'force-dynamic'

// Signup the user
export async function POST(req: Request) {
  const { name, email, password } = await req.json()

  const existingUser = await getUserByEmail(email)

  if (existingUser) {
    return ApiResponses.error(400, 'An user with this email already exists.')
  }

  const userCount = await getUserCount()

  const isSignupEnabled = await PropertySource.signupEnabled()

  // signup is always enabled when there are no users
  if (userCount != 0 && !isSignupEnabled) {
    return ApiResponses.error(400, 'Signup is not enabled')
  }

  const user = await createUser({
    name,
    email,
    password: password,
    is_admin: userCount == 0,
  })

  return ApiResponses.created(user)
}
