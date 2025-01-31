import * as schema from '@/db/schema'
import { Sharing } from './dto/sharing'
import { WorkspaceRole } from './workspace'
import { LlmModel } from '@/lib/chat/models'
import { User, WorkspaceMembership } from './dto/user'
import { ProviderConfig } from './provider'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistants'
export * from './dto/user'
export * from './dto/stats'

export type Account = schema.Account
export type AssistantUserData = schema.AssistantUserData
export type Backend = Omit<schema.Backend, 'configuration' | 'providerType'> & ProviderConfig
export type ConversationFolder = schema.ConversationFolder
export type File = schema.File
export type AssistantToolAssociation = schema.AssistantToolAssociation
export type Prompt = schema.Prompt
export type Property = schema.Property
export type Session = schema.Session
export type Workspace = schema.Workspace

export type InsertableBackend = Omit<Backend, 'id' | 'provisioned'>
export type InsertableConversation = Omit<schema.Conversation, 'id' | 'createdAt'>
export type InsertableConversationFolder = Omit<schema.ConversationFolder, 'id'>
export type InsertablePrompt = Omit<schema.Prompt, 'id'>
export type InsertableProperty = Omit<schema.Property, 'id'>
export type InsertableFile = Omit<
  schema.File,
  'id' | 'createdAt' | 'path' | 'uploaded' | 'encrypted'
>

// tools: type may be set only at creation time
export type ToolDTO = Omit<schema.Tool, 'configuration'> & {
  configuration: Record<string, any>
}
export type InsertableToolDTO = Omit<ToolDTO, 'id' | 'provisioned' | 'createdAt' | 'updatedAt'>
export type UpdateableToolDTO = Partial<Omit<InsertableToolDTO, 'type'>>

export interface UserAssistant {
  id: string
  name: string
  description: string
  iconUri?: string | null
  pinned: boolean
  lastUsed: string | null
  owner: string
  ownerName: string
  tags: string[]
  prompts: string[]
  sharing: Sharing[]
  createdAt: string
  updatedAt: string
}

export type UserPreferences = {
  language?: string
}

export type UserProfile = Omit<User, 'preferences'> & {
  workspaces: WorkspaceMembership[]
  pinnedAssistants: UserAssistant[]
  preferences: UserPreferences
}

export interface AddWorkspaceMemberRequest {
  userId: string
  role: WorkspaceRole
}

export type WorkspaceMember = schema.WorkspaceMember & {
  name: string
  email: string
}

export type WorkspaceMemberWithUser = WorkspaceMember & { user: schema.User }
export type WorkspaceWithMemberCount = schema.Workspace & { memberCount: number }

export interface BackendModels {
  backendId: string
  backendName: string
  models: LlmModel[]
}

export { UserRole } from '@/db/schema'

export type ApiKey = schema.ApiKey
export type InsertableApiKey = Omit<ApiKey, 'id' | 'provisioned' | 'createdAt' | 'enabled'>
