import { NextRequest } from 'next/server'
import { auth } from '../../../auth'
import { Session } from 'next-auth'
import ApiResponses from './ApiResponses'
import { mapExceptions } from './mapExceptions'
import * as dto from '@/types/dto'
import { cookies } from 'next/headers'
import { SESSION_TOKEN_NAME } from '@/lib/const'
import { logger } from '@/lib/logging'

export async function isCurrentUser(userId: string): Promise<boolean> {
  const session = await auth()
  return session?.user.id === userId
}

export function requireAdmin<T extends Record<string,string>> (
  func: (req: NextRequest, params: T, session: Session) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, route: {params: any}) => {
    const session = await auth()
    if (!session) {
      const cookieStore = await cookies()
      if (cookieStore.has(SESSION_TOKEN_NAME)) {
        logger.info('Deleting invalid cookie')
        cookieStore.delete(SESSION_TOKEN_NAME)
      }
      return ApiResponses.notAuthorized()
    }
    if (session?.user.role != dto.UserRoleName.ADMIN) {
      return ApiResponses.forbiddenAction()
    }
    return await func(req, await route.params, session)
  })
}

export function requireSession<T extends Record<string,string>> (
  func: (session: Session, req: NextRequest, params: T) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, route: {params: any}) => {
    const session = await auth()
    if (!session) {
      const cookieStore = await cookies()
      if (cookieStore.has(SESSION_TOKEN_NAME)) {
        logger.info('Deleting invalid cookie')
        cookieStore.delete(SESSION_TOKEN_NAME)
      }
      return ApiResponses.notAuthorized()
    }
    return await func(session, req, await route.params)
  })
}
