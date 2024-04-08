import { delete_, get, patch, post } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const getConversation = async (conversationId: string) => {
  return await get<dto.Conversation>(`/api/conversations/${conversationId}`)
}

export const getConversationMessages = async (conversationId: string) => {
  return await get<dto.Message[]>(`/api/conversations/${conversationId}/messages`)
}

export const createConversation = async (conversation: dto.InsertableConversation) => {
  return await post<dto.Conversation>(`/api/conversations`, conversation)
}

export const saveConversation = async (conversationId: string, data: Partial<dto.Conversation>) => {
  return await patch<void>(`/api/conversations/${conversationId}`, data)
}

export const deleteConversation = async (conversationId: string) => {
  await delete_(`/api/conversations/${conversationId}`)
}
