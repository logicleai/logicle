import type { Backend } from '@/types/db'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useBackend = (backendId: string) => {
  return useSWRJson<Backend>(`/api/backends/${backendId}`)
}

export const useBackends = () => {
  const url = `/api/backends`
  return useSWRJson<Backend[]>(url)
}

export const mutateBackends = async () => {
  const url = `/api/backends`
  mutate(url)
}
