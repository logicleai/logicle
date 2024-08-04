import { ModelDetectionMode, ProviderType } from '@/types/provider'

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
  backendId: string
  description: string
  imageId: string | null
  model: string
  name: string
  systemPrompt: string
  temperature: number
  tokenLimit: number
  owner: string | null
  tags: string
  createdAt: string
  updatedAt: string
}

export interface AssistantSharing {
  assistantId: string
  workspaceId: string | null
}

export interface AssistantUserData {
  assistantId: string
  lastUsed: string | null
  pinned: number
  userId: string
}

export interface Backend {
  apiKey: string
  endPoint: string
  id: string
  name: string
  providerType: ProviderType
  modelDetection: ModelDetectionMode
}

export interface Conversation {
  assistantId: string
  id: string
  name: string
  ownerId: string
  createdAt: string
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
}

export interface Image {
  id: string
  data: Buffer
  mimeType: string
}

export interface AssistantFile {
  assistantId: string
  fileId: string
}

export interface Message {
  id: string
  content: string
  conversationId: string
  parent: string | null
  role: string
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
  role: string
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
  roleId: number
  updatedAt: string
}

export interface UserRole {
  id: number
  name: string
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
  configuration: string
  createdAt: string
  updatedAt: string
}

export interface ToolFile {
  toolId: string
  fileId: string
  externalId: string | null
  status: 'uploading' | 'uploaded' | 'failed'
}

export interface MessageAudit {
  messageId: string
  conversationId: string
  userId: string
  assistantId: string
  type: 'user' | 'assistant'
  model: string
  tokens: number
  errors: string | null
  sentAt: string
}

export interface AssistantToolAssociation {
  assistantId: string
  toolId: string
}

export interface DB {
  Account: Account
  Assistant: Assistant
  AssistantFile: AssistantFile
  AssistantSharing: AssistantSharing
  AssistantUserData: AssistantUserData
  Backend: Backend
  Conversation: Conversation
  ConversationFolder: ConversationFolder
  ConversationFolderMembership: ConversationFolderMembership
  File: File
  Image: Image
  Message: Message
  MessageAudit: MessageAudit
  Tool: Tool
  ToolFile: ToolFile
  AssistantToolAssociation: AssistantToolAssociation
  Prompt: Prompt
  Property: Property
  Session: Session
  Workspace: Workspace
  WorkspaceMember: WorkspaceMember
  User: User
  UserRole: UserRole
  JacksonStore: JacksonStore
  JacksonIndex: JacksonIndex
}
