import type * as dto from '@/types/dto'
import { getParameters, getUserCount } from '@/models/user'
import { listIdpConnections } from '@/models/sso'

export const getLoginPageConfig = async (): Promise<{
  userCount: number
  identityProviders: dto.IdpConnection[]
}> => {
  return {
    userCount: await getUserCount(),
    identityProviders: await listIdpConnections(),
  }
}

export const getEnvironmentParameters = async (): Promise<dto.Parameter[]> => {
  return await getParameters()
}
