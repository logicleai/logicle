import { db } from 'db/database'
import * as dto from '@/types/dto'
import { hashPassword } from '@/lib/auth'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

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
  ssoUser: number
  password?: string
  is_admin?: boolean
}) => {
  const { name, email, password, is_admin, ssoUser } = param

  return await createUserRaw({
    name,
    email,
    password: password ? await hashPassword(password) : null,
    ssoUser,
    role: is_admin ?? false ? dto.UserRole.ADMIN : dto.UserRole.USER,
    preferences: '{}',
  })
}

export const getUsers = async (): Promise<schema.User[]> => {
  return await db.selectFrom('User').selectAll().execute()
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

export const getUserProperties = async () => {
  return await db.selectFrom('UserProperty').selectAll().execute()
}

export const getUserParameterValues = async (userId) => {
  const result = await db
    .selectFrom('UserParameterValue')
    .selectAll()
    .where('userId', '=', userId)
    .execute()
  return result
}

export const getUserParameterValuesAsRecord = async (userId) => {
  return (await getUserParameterValues(userId)).reduce(
    (acc, prop) => {
      acc[prop.userPropertyId] = prop.value
      return acc
    },
    {} as Record<string, string>
  )
}

export interface ParameterValueAndDescription {
  value: string
  description: string
}

export const getUserParameterValuesAsNameRecord = async (userId: string) => {
  const result = await db
    .selectFrom('UserParameterValue')
    .innerJoin('UserProperty', (join) =>
      join.onRef('UserParameterValue.userPropertyId', '=', 'UserProperty.id')
    )
    .select(['UserProperty.name', 'UserProperty.description', 'UserParameterValue.value'])
    .where('userId', '=', userId)
    .execute()
  return result.reduce(
    (acc, prop) => {
      acc[prop.name] = {
        description: prop.description,
        value: prop.value,
      }
      return acc
    },
    {} as Record<string, ParameterValueAndDescription>
  )
}

export const setUserParameterValues = async (userId: string, props: Record<string, string>) => {
  await db.deleteFrom('UserParameterValue').execute()

  const values: dto.UserParameterValue[] = Object.entries(props).map(([userPropertyId, value]) => ({
    id: nanoid(),
    userId,
    userPropertyId,
    value,
  }))
  if (values.length) await db.insertInto('UserParameterValue').values(values).execute()
  return 0
}

export const getUserParameterValuesByUser = async () => {
  const userProperties = await db.selectFrom('UserParameterValue').selectAll().execute()
  return userProperties.reduce<Record<string, Record<string, string>>>((acc, userProperty) => {
    const { userId, userPropertyId, value } = userProperty
    if (!acc[userId]) {
      acc[userId] = {}
    }
    acc[userId][userPropertyId] = value
    return acc
  }, {})
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
