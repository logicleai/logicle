import type { Assistant } from '@/types/db'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useAssistant = (assistantId: string) => {
  const { data, error, isLoading } = useSWRJson<Assistant>(`/api/assistants/${assistantId}`)
  return {
    isLoading,
    isError: error,
    assistant: data,
  }
}

export const useAssistants = () => {
  const url = `/api/assistants`
  return useSWRJson<Assistant[]>(url)
}

export const mutateAssistants = async () => {
  const url = `/api/assistants`
  mutate(url)
}
