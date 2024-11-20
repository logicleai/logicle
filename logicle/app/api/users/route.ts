import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as dto from '@/types/dto'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from 'db/database'
import { createUserRaw } from '@/models/user'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  const users = await db.selectFrom('User').selectAll().execute()
  const userDtos = users.map((user) => {
    return {
      ...user,
      image: user.imageId ? `/api/images/${user.imageId}` : null,
    } as dto.User
  })
  return ApiResponses.json(userDtos)
})

export const POST = requireAdmin(async (req: NextRequest) => {
  const { name, email, password, role } = await req.json()
  try {
    const userInsert = {
      name: name,
      email: email,
      password: await hashPassword(password),
      role: role,
    }
    const createdUser = await createUserRaw(userInsert)
    return ApiResponses.json(createdUser)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.foreignKey('The user already exists')
    }
    return defaultErrorResponse(interpretedException)
  }
})
