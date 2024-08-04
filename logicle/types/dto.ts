import * as schema from '@/db/schema'
import { Sharing } from './dto/sharing'
import { WorkspaceRole } from './workspace'
import { EnrichedModelList } from '@logicleai/llmosaic/dist/types'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistants'
export * from './dto/user'

export type Account = schema.Account
export type AssistantUserData = schema.AssistantUserData
export type Backend = schema.Backend
export type ConversationFolder = schema.ConversationFolder
export type File = schema.File
export type AssistantToolAssociation = schema.AssistantToolAssociation
export type Prompt = schema.Prompt
export type Property = schema.Property
export type Session = schema.Session
export type Workspace = schema.Workspace

export type InsertableBackend = Omit<schema.Backend, 'id'>
export type InsertableConversation = Omit<schema.Conversation, 'id' | 'createdAt'>
export type InsertableConversationFolder = Omit<schema.ConversationFolder, 'id'>
export type InsertablePrompt = Omit<schema.Prompt, 'id'>
export type InsertableProperty = Omit<schema.Property, 'id'>
export type InsertableFile = Omit<schema.File, 'id' | 'createdAt' | 'path' | 'uploaded'>

// tools: type may be set only at creation time
export type ToolDTO = Omit<schema.Tool, 'configuration'> & {
  configuration: Record<string, any>
}
export type InsertableToolDTO = Omit<ToolDTO, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateableToolDTO = Partial<Omit<InsertableToolDTO, 'type'>>

export interface UserAssistant {
  id: string
  name: string
  description: string
  iconUri?: string | null
  pinned: boolean
  lastUsed: string | null
  owner: string
  tags: string[]
  sharing: Sharing[]
  createdAt: string
  updatedAt: string
}

export interface AddWorkspaceMemberRequest {
  userId: string
  role: WorkspaceRole
}

export type WorkspaceMember = Omit<schema.WorkspaceMember, 'role'> & {
  role: WorkspaceRole
  name: string
  email: string
}

export type WorkspaceMemberWithUser = WorkspaceMember & { user: schema.User }
export type WorkspaceWithMemberCount = schema.Workspace & { memberCount: number }

export interface BackendModels {
  backendId: string
  backendName: string
  models: EnrichedModelList
}
