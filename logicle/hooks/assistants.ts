import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useAssistant = (assistantId: string) => {
  const { data, error, isLoading } = useSWRJson<dto.Assistant>(`/api/assistants/${assistantId}`)
  return {
    isLoading,
    isError: error,
    assistant: data,
  }
}

export const useAssistants = () => {
  const url = `/api/assistants`
  return useSWRJson<dto.AssistantWithOwner[]>(url)
}

export const mutateAssistants = async () => {
  await mutate(`/api/assistants`)
}
