import { logger } from '@/lib/logging'
import { db } from '@/db/database'
import * as bcrypt from 'bcryptjs'
import { readSessionFromRequest } from '@/lib/auth/session'
import { type SimpleSession } from '@/types/session'
import env from '@/lib/env'

export async function findUserByApiKey(apiKey: string) {
  const keys = apiKey.split('.')
  if (keys.length === 2) {
    const id = keys[0]
    const secret = keys[1]
    const row = await db
      .selectFrom('ApiKey')
      .innerJoin('User', (join) => join.onRef('User.id', '=', 'ApiKey.userId'))
      .select(['User.id', 'User.role', 'ApiKey.enabled', 'ApiKey.expiresAt', 'ApiKey.key'])
      .where('ApiKey.id', '=', id)
      .executeTakeFirst()
    if (row) {
      if (await bcrypt.compare(secret, row.key)) {
        const { key, ...userInfo } = row
        return userInfo
      }
    }
  }
  logger.warn('Someone is trying to access with an invalid API key')
  return undefined
}

type AuthResult = { success: true; value: SimpleSession } | { success: false; msg: string }

export const authenticateWithAuthorizationHeader = async (
  authorizationHeader: string
): Promise<AuthResult> => {
  if (authorizationHeader.startsWith('Bearer ')) {
    if (!env.apiKeys.enable) {
      return {
        success: false,
        msg: 'Api keys are not enabled',
      }
    }
    const apiKey = authorizationHeader.substring(7)
    const user = await findUserByApiKey(apiKey)
    if (!user) {
      return { success: false, msg: 'Invalid Api Key' }
    }
    if (!user.enabled) {
      return { success: false, msg: 'Api Key is disabled' }
    }
    if (user.expiresAt && user.expiresAt > new Date().toISOString()) {
      return { success: false, msg: 'Api Key is expired' }
    }
    return {
      success: true,
      value: {
        sessionId: `api-key:${apiKey}`,
        userId: user.id,
        userRole: user.role,
      },
    }
  } else {
    return {
      success: false,
      msg: 'Unsupported auth scheme (use Bearer <api-key>)',
    }
  }
}

export const authenticate = async (req: Request): Promise<AuthResult> => {
  const authorizationHeader = req.headers.get('Authorization')
  if (authorizationHeader) {
    return await authenticateWithAuthorizationHeader(authorizationHeader)
  }
  const session = await readSessionFromRequest(req, true)
  if (!session) {
    return { success: false, msg: 'Not authenticated' }
  }
  return {
    success: true,
    value: session,
  }
}
