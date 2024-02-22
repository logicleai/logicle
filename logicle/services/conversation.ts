import { Conversation, InsertableConversation, Message } from '@/types/db'
import { delete_, get, patch, post, put } from '@/lib/fetch'

export const getConversation = async (conversationId: string) => {
  return await get<Conversation>(`/api/conversations/${conversationId}`)
}

export const getConversationMessages = async (conversationId: string) => {
  return await get<Message[]>(`/api/conversations/${conversationId}/messages`)
}

export const createConversation = async (conversation: InsertableConversation) => {
  return await post<Conversation>(`/api/conversations`, conversation)
}

export const saveConversation = async (conversationId: string, data: Partial<Conversation>) => {
  return await patch<void>(`/api/conversations/${conversationId}`, data)
}

export const deleteConversation = async (conversationId: string) => {
  await delete_(`/api/conversations/${conversationId}`)
}
