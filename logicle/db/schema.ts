import { ProviderType } from '@/types/provider'

export const reasoningEffortValues = ['low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof reasoningEffortValues)[number]

enum WorkspaceRole {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
  EDITOR = 'EDITOR',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface Account {
  access_token: string | null
  expires_at: number | null
  expires_in: number | null
  id: string
  id_token: string | null
  provider: string
  providerAccountId: string
  refresh_token: string | null
  scope: string | null
  session_state: string | null
  token_type: string | null
  type: string
  userId: string
}

export interface Assistant {
  id: string
  draftVersionId: string | null
  publishedVersionId: string | null
  provisioned: number
  deleted: number
  owner: string
}

export interface AssistantVersion {
  id: string
  assistantId: string
  backendId: string
  description: string
  imageId: string | null
  model: string
  name: string
  systemPrompt: string
  temperature: number
  tokenLimit: number
  reasoning_effort: 'low' | 'medium' | 'high' | null
  tags: string
  prompts: string
  createdAt: string
  updatedAt: string
}

export interface AssistantSharing {
  id: string
  assistantId: string
  workspaceId: string | null
  provisioned: number
}

export interface AssistantUserData {
  assistantId: string
  lastUsed: string | null
  pinned: number
  userId: string
}

export interface Backend {
  id: string
  name: string
  providerType: ProviderType
  configuration: string
  provisioned: number
}

export interface Conversation {
  assistantId: string
  id: string
  name: string
  ownerId: string
  createdAt: string
  lastMsgSentAt: string | null
}

export interface ConversationSharing {
  id: string
  lastMessageId: string
}

export interface ConversationFolder {
  id: string
  name: string
  ownerId: string
}

export interface ConversationFolderMembership {
  conversationId: string
  folderId: string
}

export interface File {
  id: string
  name: string
  path: string
  type: string
  size: number
  uploaded: 0 | 1
  createdAt: string
  encrypted: 0 | 1
}

export interface Image {
  id: string
  data: Buffer
  mimeType: string
}

export interface AssistantVersionFile {
  assistantVersionId: string
  fileId: string
}

export interface Message {
  id: string
  content: string
  conversationId: string
  parent: string | null
  role:
    | 'user'
    | 'error'
    | 'assistant'
    | 'tool'
    | 'tool-result'
    | 'tool-call'
    | 'tool-debug'
    | 'tool-output'
    | 'tool-auth-request'
    | 'tool-auth-response'
  sentAt: string
}

export interface Prompt {
  content: string
  description: string
  id: string
  name: string
  ownerId: string
}

export interface Property {
  id: string
  name: string
  value: string
}

export interface Session {
  expires: string
  id: string
  sessionToken: string
  userId: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  domain: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  id: string
  userId: string
  workspaceId: string
  role: WorkspaceRole
  createdAt: string
  updatedAt: string
}

export interface User {
  createdAt: string
  email: string
  id: string
  imageId: string | null
  name: string
  password: string | null
  role: UserRole
  provisioned: number
  updatedAt: string
  preferences: string
  ssoUser: number
}

export interface UserProperty {
  id: string
  name: string
  description: string
}

export interface UserParameterValue {
  id: string
  userId: string
  userPropertyId: string
  value: string
}

export interface JacksonStore {
  key: string
  value: string
  iv: string | null
  tag: string | null
  createdAt: string
  expiresAt: string | null
  namespace: string
}

export interface JacksonIndex {
  key: string // Foreign Key to JacksonStore.key
  index: string
}

export interface Tool {
  id: string
  type: string
  name: string
  description: string
  imageId: string | null
  tags: string
  promptFragment: string
  configuration: string
  provisioned: number
  capability: number
  sharing: 'private' | 'public' | 'workspace'
  createdAt: string
  updatedAt: string
}

export interface ToolSharing {
  id: string
  toolId: string
  workspaceId: string
}

export interface MessageAudit {
  messageId: string
  conversationId: string
  userId: string
  assistantId: string
  type: 'user' | 'assistant' | 'tool' | 'tool-auth-request' | 'tool-auth-response'
  model: string
  tokens: number
  errors: string | null
  sentAt: string
}

export interface AssistantVersionToolAssociation {
  assistantVersionId: string
  toolId: string
}

export interface ApiKey {
  id: string
  key: string
  userId: string
  description: string
  createdAt: string
  expiresAt: string | null
  enabled: number
  provisioned: number
}

export interface DB {
  Account: Account
  ApiKey: ApiKey
  Assistant: Assistant
  AssistantVersion: AssistantVersion
  AssistantVersionFile: AssistantVersionFile
  AssistantSharing: AssistantSharing
  AssistantVersionToolAssociation: AssistantVersionToolAssociation
  AssistantUserData: AssistantUserData
  Backend: Backend
  Conversation: Conversation
  ConversationFolder: ConversationFolder
  ConversationFolderMembership: ConversationFolderMembership
  ConversationSharing: ConversationSharing
  File: File
  Image: Image
  Message: Message
  MessageAudit: MessageAudit
  Tool: Tool
  ToolSharing: ToolSharing
  Prompt: Prompt
  Property: Property
  Session: Session
  Workspace: Workspace
  WorkspaceMember: WorkspaceMember
  User: User
  UserProperty: UserProperty
  UserParameterValue: UserParameterValue
  JacksonStore: JacksonStore
  JacksonIndex: JacksonIndex
}
