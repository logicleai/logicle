import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

export const useAssistants = () => {
  const url = `/api/assistants`
  return useSWRJson<dto.AssistantWithOwner[]>(url)
}

export const mutateAssistants = async () => {
  await mutate(`/api/assistants`)
}
