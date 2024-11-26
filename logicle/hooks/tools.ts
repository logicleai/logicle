import type { ToolDTO } from '@/types/dto'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useTool = (toolId: string) => {
  return useSWRJson<ToolDTO>(`/api/tools/${toolId}`)
}

export const useTools = () => {
  const url = `/api/tools`
  return useSWRJson<ToolDTO[]>(url)
}

export const mutateTools = async () => {
  const url = `/api/tools`
  await mutate(url)
}
