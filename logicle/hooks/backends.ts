import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useBackend = (backendId: string) => {
  return useSWRJson<dto.Backend>(`/api/backends/${backendId}`)
}

export const useBackends = () => {
  const url = `/api/backends`
  return useSWRJson<dto.Backend[]>(url)
}

export const useBackendsModels = () => {
  const url = `/api/backends/models`
  return useSWRJson<dto.BackendModels[]>(url)
}

export const mutateBackends = async () => {
  const url = `/api/backends`
  mutate(url)
}
