import * as dto from '@/types/dto'
import { useSWRJson } from './swr'
import { mutate } from 'swr'

export const useApiKeys = (userId: string) => {
  const url = `/api/users/${userId}/apiKeys`
  return useSWRJson<dto.ApiKey[]>(url)
}

export const useMyApiKeys = () => {
  const url = `/api/user/apikeys`
  return useSWRJson<dto.ApiKey[]>(url)
}

export const mutateApiKeys = async (userId: string) => {
  mutate(`/api/user/apikeys`)
  mutate(`/api/users/${userId}/apikeys`)
}
