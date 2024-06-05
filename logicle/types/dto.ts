import * as schema from '@/db/schema'
import { Sharing } from './dto/sharing'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistants'

export type Account = schema.Account
export type AssistantUserData = schema.AssistantUserData
export type Backend = schema.Backend
export type ConversationFolder = schema.ConversationFolder
export type File = schema.File
export type Message = schema.Message
export type AssistantToolAssociation = schema.AssistantToolAssociation
export type Prompt = schema.Prompt
export type Property = schema.Property
export type Session = schema.Session
export type Workspace = schema.Workspace
export type WorkspaceMember = schema.WorkspaceMember

export type InsertableBackend = Omit<schema.Backend, 'id'>
export type InsertableConversation = Omit<schema.Conversation, 'id' | 'createdAt'>
export type InsertableConversationFolder = Omit<schema.ConversationFolder, 'id'>
export type InsertableUser = Omit<schema.User, 'id' | 'imageId' | 'createdAt' | 'updatedAt'>
export type InsertablePrompt = Omit<schema.Prompt, 'id'>
export type InsertableProperty = Omit<schema.Property, 'id'>
export type InsertableFile = Omit<schema.File, 'id' | 'createdAt' | 'path' | 'uploaded'>

// tools: type may be set only at creation time
export type ToolDTO = Omit<schema.Tool, 'configuration'> & {
  configuration: Record<string, any>
}
export type InsertableToolDTO = Omit<ToolDTO, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateableToolDTO = Partial<Omit<InsertableToolDTO, 'type'>>
export type UpdateableUser = Partial<schema.User>

export interface UserAssistant {
  id: string
  name: string
  description: string
  iconUri?: string | null
  pinned: boolean
  lastUsed: string | null
  owner: string
  sharing: Sharing[]
}
