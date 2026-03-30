import { useSWRJson } from './swr'
import { mutate } from 'swr'
import { AdminUser } from '@/types/dto/user'

export const useUsers = () => {
  const url = `/api/users`
  return useSWRJson<AdminUser[]>(url)
}

export const mutateUsers = async () => {
  const url = `/api/users`
  return mutate(url)
}

export const useUser = (userId: string) => {
  return useSWRJson<AdminUser>(`/api/users/${userId}`)
}

export const mutateUser = (userId: string) => {
  return mutate(`/api/users/${userId}`)
}
