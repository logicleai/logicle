import { useSWRJson } from './swr'
import { mutate } from 'swr'
import { SelectableUserDTO } from '@/types/user'

export const useUsers = () => {
  const url = `/api/users`
  return useSWRJson<SelectableUserDTO[]>(url)
}

export const mutateUsers = async () => {
  const url = `/api/users`
  mutate(url)
}

export const useUser = (userId: string) => {
  return useSWRJson<SelectableUserDTO>(`/api/users/${userId}`)
}
