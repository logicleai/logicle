import { db } from 'db/database'
import type { Session } from 'next-auth'
import * as dto from '@/types/dto'
import { hashPassword } from '@/lib/auth'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'
import { logger } from '@/lib/logging'

export const createUserRaw = async (
  user: Omit<schema.User, 'id' | 'createdAt' | 'imageId' | 'updatedAt' | 'provisioned'>
) => {
  const id = nanoid()
  return createUserRawWithId(id, user, false)
}

export const createUserRawWithId = async (
  id: string,
  user: Omit<schema.User, 'id' | 'createdAt' | 'imageId' | 'updatedAt' | 'provisioned'>,
  provisioned: boolean
) => {
  await db
    .insertInto('User')
    .values({
      ...user,
      email: user.email.toLowerCase(),
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provisioned: provisioned ? 1 : 0,
    })
    .execute()
  const createdUser = await getUserById(id)
  if (!createdUser) {
    throw new Error('User not created correctly')
  }
  return createdUser
}

export const createUser = async (param: {
  name: string
  email: string
  password?: string
  is_admin?: boolean
}) => {
  const { name, email, password, is_admin } = param

  return await createUserRaw({
    name,
    email,
    password: password ? await hashPassword(password) : null,
    role: is_admin ?? false ? dto.UserRole.ADMIN : dto.UserRole.USER,
    preferences: '{}',
  })
}

export const getUserById = async (id: string): Promise<schema.User | undefined> => {
  return db.selectFrom('User').selectAll().where('id', '=', id).executeTakeFirst()
}

export const getUserByEmail = async (email: string): Promise<schema.User | undefined> => {
  return db
    .selectFrom('User')
    .selectAll()
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst()
}

export const getUserCount = async () => {
  const result = (await db
    .selectFrom('User')
    .select((eb) => eb.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()) as { count: number }
  return result.count
}

export const getUserWorkspaceMemberships = async (
  userId: string
): Promise<dto.WorkspaceMembership[]> => {
  return await db
    .selectFrom('WorkspaceMember')
    .innerJoin('Workspace', (join) =>
      join.onRef('Workspace.id', '=', 'WorkspaceMember.workspaceId')
    )
    .select('Workspace.id')
    .select('Workspace.name')
    .select('WorkspaceMember.role')
    .where('WorkspaceMember.userId', '=', userId)
    .execute()
}

export const getUserFromSession = async (session: Session): Promise<dto.User | null> => {
  if (session.user === null) {
    return null
  }

  const id = session.user?.id

  if (!id) {
    return null
  }

  const user = await getUserById(id)
  if (!user) {
    return null
  }

  const result = {
    ...user,
    image: user?.imageId ? `/api/images/${user.imageId}` : null,
  }
  return result
}

export const deleteUserById = async (id: string) => {
  return db.deleteFrom('User').where('id', '=', id).execute()
}

export const deleteUserByEmail = async (email: string) => {
  return db.deleteFrom('User').where('email', '=', email.toLowerCase()).execute()
}

export const updateUser = async (userId: string, user: Partial<schema.User>) => {
  const userWithFixedDates = {
    ...user,
    provisioned: undefined, // protect against malicious API usage
    createdAt: undefined,
    updatedAt: new Date().toISOString(),
  } as Partial<schema.User>
  await db.updateTable('User').set(userWithFixedDates).where('id', '=', userId).execute()
}

export const deleteUserImage = async (userId: string) => {
  const deleteResult = await db
    .deleteFrom('Image')
    .where('Image.id', 'in', (eb) =>
      eb.selectFrom('User').select('User.imageId').where('User.id', '=', userId)
    )
    .executeTakeFirstOrThrow()
  logger.debug(`Deleted ${deleteResult.numDeletedRows} images`)
}
