import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useTool = (toolId: string) => {
  return useSWRJson<dto.Tool>(`/api/tools/${toolId}`)
}

export const useTools = () => {
  const url = `/api/tools`
  return useSWRJson<dto.Tool[]>(url)
}

export const mutateTools = async () => {
  const url = `/api/tools`
  await mutate(url)
}
