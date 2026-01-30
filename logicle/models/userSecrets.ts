import { db } from 'db/database'
import { nanoid } from 'nanoid'
import {
  decryptUserSecret,
  encryptUserSecret,
  UserSecretMissingKeyError,
  UserSecretUnreadableError,
} from '@/lib/userSecrets'
import { UserSecretType } from '@/lib/userSecrets/constants'

export interface UserSecretStatus {
  id: string
  context: string
  type: string
  label: string
  readable: boolean
}

export type UserSecretResolution =
  | { status: 'ok'; value: string }
  | { status: 'missing' }
  | { status: 'unreadable' }

export const createUserSecret = async (
  userId: string,
  context: string,
  type: UserSecretType,
  label: string,
  value: string
) => {
  const encrypted = encryptUserSecret(value)
  const now = new Date().toISOString()
  await db
    .insertInto('UserSecret')
    .values({
      id: nanoid(),
      userId,
      context,
      type,
      label,
      value: encrypted,
      createdAt: now,
      updatedAt: now,
    })
    .executeTakeFirstOrThrow()
  const stored = await getUserSecretByUserContextType(userId, context, type)
  if (!stored) {
    throw new Error('Secret creation failed')
  }
  return stored
}

export const deleteUserSecretById = async (userId: string, id: string) => {
  const result = await db
    .deleteFrom('UserSecret')
    .where('userId', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0)
}

export const getUserSecretByUserContextType = async (
  userId: string,
  context: string,
  type: UserSecretType
) => {
  return await db
    .selectFrom('UserSecret')
    .selectAll()
    .where('userId', '=', userId)
    .where('context', '=', context)
    .where('type', '=', type)
    .executeTakeFirst()
}

export const getUserSecretValue = async (
  userId: string,
  context: string,
  type: UserSecretType
): Promise<UserSecretResolution> => {
  const record = await db
    .selectFrom('UserSecret')
    .selectAll()
    .where('userId', '=', userId)
    .where('context', '=', context)
    .where('type', '=', type)
    .executeTakeFirst()
  if (!record) {
    return { status: 'missing' }
  }
  try {
    const value = decryptUserSecret(record.value)
    return { status: 'ok', value }
  } catch (error) {
    if (error instanceof UserSecretUnreadableError || error instanceof UserSecretMissingKeyError) {
      return { status: 'unreadable' }
    }
    throw error
  }
}

export const listUserSecretStatuses = async (
  userId: string,
  type?: UserSecretType
): Promise<UserSecretStatus[]> => {
  let query = db
    .selectFrom('UserSecret')
    .select(['id', 'context', 'type', 'label', 'value'])
    .where('userId', '=', userId)
  if (type) {
    query = query.where('type', '=', type)
  }
  const secrets = await query.execute()
  return secrets.map((secret) => {
    try {
      decryptUserSecret(secret.value)
      return {
        id: secret.id,
        context: secret.context,
        type: secret.type,
        label: secret.label,
        readable: true,
      }
    } catch (error) {
      if (
        error instanceof UserSecretUnreadableError ||
        error instanceof UserSecretMissingKeyError
      ) {
        return {
          id: secret.id,
          context: secret.context,
          type: secret.type,
          label: secret.label,
          readable: false,
        }
      }
      throw error
    }
  })
}
