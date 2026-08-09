import type * as dto from '@/types/dto'
import { getParameters, getUserCount } from '@/models/user'
import { listIdpConnections } from '@/models/sso'

export const getLoginPageConfig = async (): Promise<{
  userCount: number
  identityProviders: dto.PublicIdpConnection[]
}> => {
  const connections = await listIdpConnections()
  return {
    userCount: await getUserCount(),
    identityProviders: connections.map(({ id, name, description, type }) => ({ id, name, description, type })),
  }
}

export const getEnvironmentParameters = async (): Promise<dto.Parameter[]> => {
  return await getParameters()
}
