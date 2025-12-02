import { getUserById, getUserParameterValuesAsNameRecord } from '@/models/user'
import env from './env'

export const getUserParameters = async (userId: string) => {
  const user = await getUserById(userId)
  if (!user) {
    throw new Error(`No such user: ${userId}`)
  }
  const result = {
    ...(await getUserParameterValuesAsNameRecord(userId)),
    USER_NAME: {
      value: user.name,
      description: 'USER_NAME',
      defaultValue: null,
    },
    USER_EMAIL: {
      value: user.email,
      description: 'USER_EMAIL',
      defaultValue: null,
    },
    TENANT_URL: {
      value: env.appUrl,
      description: 'TENANT_URL',
      defaultValue: null,
    },
  }
  return result
}
