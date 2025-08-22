import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../auth'
import ApiResponses from './ApiResponses'
import { mapExceptions } from './mapExceptions'
import * as dto from '@/types/dto'
import { cookies } from 'next/headers'
import { SESSION_TOKEN_NAME } from '@/lib/const'
import { logger } from '@/lib/logging'
import { db } from '@/db/database'

export async function isCurrentUser(userId: string): Promise<boolean> {
  const session = await auth()
  return session?.user.id === userId
}

export async function findUserByApiKey(apiKey: string) {
  return await db
    .selectFrom('ApiKey')
    .innerJoin('User', (join) => join.onRef('User.id', '=', 'ApiKey.userId'))
    .select(['User.id', 'User.role', 'ApiKey.enabled', 'ApiKey.expiresAt'])
    .where('ApiKey.key', '=', apiKey)
    .executeTakeFirst()
}
export interface SimpleSession {
  userId: string
  userRole: string
}

type AuthResult = { success: true; value: SimpleSession } | { success: false; error: NextResponse }

const authenticate = async (req: NextRequest): Promise<AuthResult> => {
  const authorizationHeader = req.headers.get('Authorization')
  let simpleSession: SimpleSession | undefined

  if (authorizationHeader) {
    if (authorizationHeader.startsWith('Bearer ')) {
      const apiKey = authorizationHeader.substring(7)
      const user = await findUserByApiKey(apiKey)
      if (!user) {
        return { success: false, error: ApiResponses.notAuthorized('Invalid Api Key') }
      }
      if (!user.enabled) {
        return { success: false, error: ApiResponses.notAuthorized('Api Key is disabled') }
      }
      if (user.expiresAt && user.expiresAt > new Date().toISOString()) {
        return { success: false, error: ApiResponses.notAuthorized('Api Key is expired') }
      }
      return { success: true, value: { userId: user.id, userRole: user.role } }
    } else {
      return {
        success: false,
        error: ApiResponses.notAuthorized('Unsupported auth scheme (use Bearer <api-key>)'),
      }
    }
  }
  if (!simpleSession) {
    const session = await auth()
    if (!session) {
      const cookieStore = await cookies()
      if (cookieStore.has(SESSION_TOKEN_NAME)) {
        logger.info('Deleting invalid cookie')
        cookieStore.delete(SESSION_TOKEN_NAME)
      }
      return { success: false, error: ApiResponses.notAuthorized() }
    }
    return { success: true, value: { userId: session.user.id, userRole: session.user.role } }
  }
  return { success: false, error: ApiResponses.notAuthorized() }
}

export function requireAdmin<T extends Record<string, string>>(
  func: (req: NextRequest, params: T, session: SimpleSession) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, params: T) => {
    const authResult = await authenticate(req)
    if (!authResult.success) {
      return authResult.error
    }
    if (authResult.value.userRole !== dto.UserRole.ADMIN) {
      return ApiResponses.forbiddenAction()
    }
    return await func(req, params, authResult.value)
  })
}

export function requireSession<T extends Record<string, string>>(
  func: (session: SimpleSession, req: NextRequest, params: T) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, params: T) => {
    const authResult = await authenticate(req)
    if (!authResult.success) {
      return authResult.error
    } else {
      return await func(authResult.value, req, params)
    }
  })
}
