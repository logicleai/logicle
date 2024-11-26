import { useSWRJson } from './swr'
import { mutate } from 'swr'
import { User } from '@/types/dto/user'

export const useUsers = () => {
  const url = `/api/users`
  return useSWRJson<User[]>(url)
}

export const mutateUsers = async () => {
  const url = `/api/users`
  return mutate(url)
}

export const useUser = (userId: string) => {
  return useSWRJson<User>(`/api/users/${userId}`)
}
