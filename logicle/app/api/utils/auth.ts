import { NextRequest } from 'next/server'
import { auth } from '../../../auth'
import { Session } from 'next-auth'
import ApiResponses from './ApiResponses'
import { mapExceptions } from './mapExceptions'
import * as dto from '@/types/dto'
import { cookies } from 'next/headers'

export async function isCurrentUser(userId: string): Promise<boolean> {
  const session = await auth()
  return session?.user.id === userId
}

export function requireAdmin(
  func: (req: NextRequest, route: any, session: Session) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, params: object) => {
    const session = await auth()
    if (!session) {
      const cookieStore = cookies()
      if (cookieStore.has('authjs.session-token')) {
        console.log('Deleting invalid cookie')
        cookieStore.delete('authjs.session-token')
      }
      return ApiResponses.notAuthorized()
    }
    if (session?.user.role != dto.UserRoleName.ADMIN) {
      return ApiResponses.forbiddenAction()
    }
    return await func(req, params, session)
  })
}

export function requireSession(
  func: (session: Session, req: NextRequest, route: any) => Promise<Response>
) {
  return mapExceptions(async (req: NextRequest, params: object) => {
    const session = await auth()
    if (!session) {
      const cookieStore = cookies()
      if (cookieStore.has('authjs.session-token')) {
        console.log('Deleting invalid cookie')
        cookieStore.delete('authjs.session-token')
      }
      return ApiResponses.notAuthorized()
    }
    return await func(session, req, params)
  })
}
