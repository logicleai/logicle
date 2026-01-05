import * as schema from '../../db/schema'
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

export type ConversationFolder = z.infer<typeof conversationFolderSchema>

export type InsertableConversationFolder = z.infer<typeof insertableConversationFolderSchema>
