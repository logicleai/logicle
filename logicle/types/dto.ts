import * as schema from '@/db/schema'
import { Sharing, Sharing2 } from './dto/sharing'
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
export type Backend = Omit<schema.Backend, 'configuration' | 'providerType'> & ProviderConfig
export type ConversationFolder = schema.ConversationFolder
export type File = schema.File
export type Prompt = schema.Prompt
export type Property = schema.Property
export type Session = schema.Session
export type Workspace = schema.Workspace

export type InsertableBackend = Omit<Backend, 'id' | 'provisioned'>
export type InsertableConversation = Omit<schema.Conversation, 'id' | 'createdAt' | 'lastMsgSentAt'>
export type UpdateableConversation = Partial<
  Omit<InsertableConversation, 'assistantId' | 'ownerId'>
>
export type InsertableConversationFolder = Omit<schema.ConversationFolder, 'id' | 'ownerId'>
export type InsertablePrompt = Omit<schema.Prompt, 'id'>
export type InsertableProperty = Omit<schema.Property, 'id'>
export type InsertableFile = Omit<
  schema.File,
  'id' | 'createdAt' | 'path' | 'uploaded' | 'encrypted'
>

// tools: type may be set only at creation time
export type Tool = Omit<schema.Tool, 'configuration' | 'tags' | 'imageId' | 'sharing'> & {
  configuration: Record<string, unknown>
  tags: string[]
  icon: string | null
  sharing: Sharing2
}

export type InsertableTool = Omit<
  Tool,
  'id' | 'provisioned' | 'createdAt' | 'updatedAt' | 'capability'
>
export type UpdateableTool = Partial<Omit<InsertableTool, 'type'>>

export interface AssistantIdentification {
  id: string
  name: string
  iconUri?: string | null
}

export interface UserAssistant extends AssistantIdentification {
  versionId: string
  description: string
  model: string
  pinned: boolean
  lastUsed: string | null
  owner: string
  ownerName: string
  tags: string[]
  prompts: string[]
  sharing: Sharing[]
  createdAt: string
  updatedAt: string
  cloneable: boolean
  tokenLimit: number
  tools: {
    id: string
    name: string
  }[]
  pendingChanges: boolean
}

export interface UserAssistantWithSupportedMedia extends UserAssistant {
  supportedMedia: string[]
}

export type UserPreferences = {
  language: string
  conversationEditing: boolean
  showIconsInChatbar: boolean
  advancedSystemPromptEditor: boolean
  advancedMessageEditor: boolean
}

export const userPreferencesDefaults: UserPreferences = {
  language: 'default',
  conversationEditing: true,
  showIconsInChatbar: true,
  advancedSystemPromptEditor: false,
  advancedMessageEditor: false,
}

export type UserProfile = Omit<User, 'preferences' | 'password'> & {
  workspaces: WorkspaceMembership[]
  lastUsedAssistant: UserAssistant | null
  pinnedAssistants: UserAssistant[]
  preferences: Partial<UserPreferences>
  ssoUser: boolean
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
export type InsertableUserApiKey = Omit<InsertableApiKey, 'userId' | 'key'>
