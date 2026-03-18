import useSWR from 'swr'
import * as dto from '@/types/dto'
import { getUserSecretStatuses } from '@/services/userSecrets'

const fetcher = async () => {
  const response = await getUserSecretStatuses()
  if (response.error) {
    throw new Error(response.error.message)
  }
  return response.data as dto.UserSecretStatus[]
}

export const useUserSecretStatuses = () => {
  return useSWR<dto.UserSecretStatus[]>(`/api/user/secrets`, fetcher)
}
