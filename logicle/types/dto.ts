import * as schema from '@/db/schema'
import { Sharing } from './dto/sharing'
import { WorkspaceRole } from './workspace'
import { LlmModel } from '@/lib/chat/models'
import { User, UserRole, WorkspaceMembership } from './dto/user'
import { ProviderConfig } from './provider'
import { insertableBackendSchema, updateableBackendSchema } from '@/types/dto/backend'
import { z } from 'zod'
import { insertableToolSchema, toolSchema, updateableToolSchema } from './dto/tool'
import { apiKeySchema, insertableApiKeySchema, insertableUserApiKeySchema } from './dto/apikey'
import { fileSchema, insertableFileSchema } from './dto/file'
import { insertablePropertySchema, propertySchema } from './dto/property'
import { promptSchema } from './dto/prompt'
export { UserRole } from '@/db/schema'

export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistants'
export * from './dto/user'
export * from './dto/stats'
export * from './dto/sso'

export type Account = schema.Account
export type Backend = Omit<schema.Backend, 'configuration' | 'providerType'> & ProviderConfig
export type ConversationFolder = schema.ConversationFolder
export type File = z.infer<typeof fileSchema>
export type Prompt = z.infer<typeof promptSchema>
export type Property = z.infer<typeof propertySchema>

export type Session = schema.Session
export type Workspace = schema.Workspace

export type InsertableBackend = z.infer<typeof insertableBackendSchema>
export type UpdateableBackend = Partial<InsertableBackend>

export type InsertableConversation = Omit<schema.Conversation, 'id' | 'createdAt' | 'lastMsgSentAt'>
export type UpdateableConversation = Partial<
  Omit<InsertableConversation, 'assistantId' | 'ownerId'>
>
export type InsertableConversationFolder = Omit<schema.ConversationFolder, 'id' | 'ownerId'>
export type InsertablePrompt = Omit<schema.Prompt, 'id'>
export type InsertableProperty = z.infer<typeof insertablePropertySchema>

export type InsertableFile = z.infer<typeof insertableFileSchema>

export type Tool = z.infer<typeof toolSchema>

export type InsertableTool = z.infer<typeof insertableToolSchema>

export type UpdateableTool = z.infer<typeof updateableToolSchema>

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

export type Parameter = schema.Parameter
export type UserParameterValue = schema.UserParameterValue

export type UserProfile = Omit<User, 'preferences' | 'password'> & {
  workspaces: WorkspaceMembership[]
  lastUsedAssistant: UserAssistant | null
  pinnedAssistants: UserAssistant[]
  preferences: Partial<UserPreferences>
  properties: Record<string, string>
  ssoUser: boolean
  role: UserRole
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

export type ApiKey = z.infer<typeof apiKeySchema>
export type InsertableApiKey = z.infer<typeof insertableApiKeySchema>
export type InsertableUserApiKey = z.infer<typeof insertableUserApiKeySchema>
