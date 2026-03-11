import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const estimateAssistantTokens = async (
  assistantId: string,
  payload: dto.TokenEstimateRequest
) => {
  return await post<dto.TokenEstimateResponse>(
    `/api/user/assistants/${assistantId}/tokens/estimate`,
    payload
  )
}

export const estimateAssistantDraftTokens = async (
  payload: dto.AssistantTokenEstimateRequest
) => {
  return await post<dto.AssistantTokenEstimateResponse>(`/api/assistants/tokens/estimate`, payload)
}
