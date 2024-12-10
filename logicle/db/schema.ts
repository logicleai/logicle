import { ProviderType } from '@/types/provider'

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
  prompts: string
  createdAt: string
  updatedAt: string
  provisioned: number
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

export interface AssistantFile {
  assistantId: string
  fileId: string
}

export interface Message {
  id: string
  content: string
  conversationId: string
  parent: string | null
  role:
    | 'user'
    | 'assistant'
    | 'tool-result'
    | 'tool-call'
    | 'tool-debug'
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
  provisioned: number
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
  type:
    | 'user'
    | 'assistant'
    | 'tool-call'
    | 'tool-result'
    | 'tool-auth-request'
    | 'tool-auth-response'
    | 'tool-output'
  model: string
  tokens: number
  errors: string | null
  sentAt: string
}

export interface AssistantToolAssociation {
  assistantId: string
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
  JacksonStore: JacksonStore
  JacksonIndex: JacksonIndex
}
