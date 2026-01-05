import { z } from 'zod'

export const conversationFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
})

export const insertableConversationFolderSchema = conversationFolderSchema.omit({
  id: true,
  ownerId: true,
})

export const addConversationToFolderSchema = z.object({
  conversationId: z.string(),
})

export const updateableConversationFolderSchema = insertableConversationFolderSchema.partial()

export type ConversationFolder = z.infer<typeof conversationFolderSchema>

export type InsertableConversationFolder = z.infer<typeof insertableConversationFolderSchema>

export type UpdateableConversationFolder = z.infer<typeof updateableConversationFolderSchema>

export type AddConversationToFolder = z.infer<typeof addConversationToFolderSchema>
