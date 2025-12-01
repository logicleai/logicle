import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as dto from '@/types/dto'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { createUserRaw, getUserParameterValuesByUser, getUsers } from '@/models/user'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  const users = await getUsers()
  const userPropertiesByUser = await getUserParameterValuesByUser()
  const userDtos = users.map((user) => {
    return {
      ...user,
      ssoUser: !!user.ssoUser,
      image: user.imageId ? `/api/images/${user.imageId}` : null,
      properties: userPropertiesByUser[user.id] ?? {},
    } as dto.User
  })
  return ApiResponses.json(userDtos)
})

export const POST = requireAdmin(async (req: NextRequest) => {
  const { name, email, password, role, ssoUser } = await req.json()
  try {
    const userInsert = {
      name: name,
      email: email,
      password: password ? await hashPassword(password) : null,
      role: role,
      ssoUser: ssoUser ? 1 : 0,
      preferences: '{}',
    }
    const createdUser = await createUserRaw(userInsert)
    return ApiResponses.json(createdUser)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code === KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.foreignKey('The user already exists')
    }
    return defaultErrorResponse(interpretedException)
  }
})
