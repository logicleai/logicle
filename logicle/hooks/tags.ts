import { useSWRJson } from './swr'

export const useAssistantTagSuggestions = () => {
  return useSWRJson<string[]>(`/api/assistants/tags`)
}

export const useToolTagSuggestions = () => {
  return useSWRJson<string[]>(`/api/tools/tags`)
}
