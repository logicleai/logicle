import * as schema from '@/db/schema'
import { Sharing } from './dto/sharing'
import { LlmModel } from '@/lib/chat/models'
import { User, UserRole, WorkspaceMembership } from './dto/user'
export { UserRole } from '@/db/schema'

export * from './dto/auth'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistant'
export * from './dto/user'
export * from './dto/stats'
export * from './dto/sso'
export * from './dto/file'
export * from './dto/backend'
export * from './dto/tool'
export * from './dto/apikey'
export * from './dto/prompt'
export * from './dto/property'
export * from './dto/conversationfolder'
export * from './dto/parameter'
export * from './dto/workspace'

export type Account = schema.Account

export type Session = schema.Session

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

export interface BackendModels {
  backendId: string
  backendName: string
  models: LlmModel[]
}
