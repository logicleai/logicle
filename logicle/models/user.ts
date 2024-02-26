import { db } from 'db/database'
import type { Session } from 'next-auth'
import { InsertableUser, UpdateableUser } from '@/types/dto'
import { UserRoleId } from '@/types/user'
import { hashPassword } from '@/lib/auth'
import { nanoid } from 'nanoid'

export const createUserRaw = async (user: InsertableUser) => {
  const id = nanoid()
  await db
    .insertInto('User')
    .values({
      ...user,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    password: password ? await hashPassword(password) : '',
    roleId: is_admin ?? false ? UserRoleId.ADMIN : UserRoleId.USER,
  })
}

export const getUserById = async (id: string) => {
  return db.selectFrom('User').selectAll().where('id', '=', id).executeTakeFirst()
}

export const getUserByEmail = async (email: string) => {
  return db.selectFrom('User').selectAll().where('email', '=', email).executeTakeFirst()
}

export const getUserCount = async () => {
  const result = (await db
    .selectFrom('User')
    .select((eb) => eb.fn.countAll().as('count'))
    .executeTakeFirstOrThrow()) as { count: number }
  return result.count
}

export const getUserBySession = async (session: Session | null) => {
  if (session === null || session.user === null) {
    return null
  }

  const id = session?.user?.id

  if (!id) {
    return null
  }

  return await getUserById(id)
}

export const deleteUserById = async (id: string) => {
  return db.deleteFrom('User').where('id', '=', id).execute()
}

export const deleteUserByEmail = async (email: string) => {
  return db.deleteFrom('User').where('email', '=', email).execute()
}

export const updateUser = async (userId: string, user: UpdateableUser) => {
  const userWithFixedDates = {
    ...user,
    createdAt: undefined,
    updatedAt: new Date().toISOString(),
  } as UpdateableUser
  await db.updateTable('User').set(userWithFixedDates).where('id', '=', userId).execute()
}
