import { z } from 'zod'

export const conversationFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
}).meta({ id: 'ConversationFolder' })

export const insertableConversationFolderSchema = conversationFolderSchema.omit({
  id: true,
  ownerId: true,
}).meta({ id: 'InsertableConversationFolder' })

export const addConversationToFolderSchema = z.object({
  conversationId: z.string(),
}).meta({ id: 'AddConversationToFolder' })

export const updateableConversationFolderSchema = insertableConversationFolderSchema
  .partial()
  .meta({ id: 'UpdateableConversationFolder' })

export type ConversationFolder = z.infer<typeof conversationFolderSchema>

export type InsertableConversationFolder = z.infer<typeof insertableConversationFolderSchema>

export type UpdateableConversationFolder = z.infer<typeof updateableConversationFolderSchema>

export type AddConversationToFolder = z.infer<typeof addConversationToFolderSchema>
