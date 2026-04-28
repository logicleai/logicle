import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const estimateAssistantTokens = async (
  assistantId: string,
  payload: dto.TokenEstimateRequest
) => {
  return await post<dto.TokenEstimateResponse>(
    `/api/me/assistants/${assistantId}/tokens/estimate`,
    payload
  )
}

export const estimateAssistantDraftTokens = async (
  payload: dto.AssistantTokenEstimateRequest,
  options?: { detail?: boolean }
) => {
  const url = options?.detail
    ? '/api/assistants/tokens/estimate?detail=true'
    : '/api/assistants/tokens/estimate'
  return await post<dto.AssistantTokenEstimateResponse>(url, payload)
}
