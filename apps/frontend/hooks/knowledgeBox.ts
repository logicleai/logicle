import * as dto from '@/types/dto'
import { useSWRJson } from './swr'

export const useKnowledgeBoxStatus = (toolId?: string) => {
  return useSWRJson<dto.KnowledgeBoxStatus>(toolId ? `/api/tools/${toolId}/knowledge-box` : null)
}
