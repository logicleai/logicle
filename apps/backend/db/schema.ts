import { ProviderType } from '@/types/provider'

export const reasoningEffortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof reasoningEffortValues)[number]
export const fileEncryptionValues = ['pgp', 'aead'] as const
export type FileEncryption = (typeof fileEncryptionValues)[number]

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
  hidden: number
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
  versionName: string | null
  systemPrompt: string
  temperature: number
  tokenLimit: number
  reasoning_effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null
  contextCompression: string | null
  tags: string
  prompts: string
  subAssistants: string | null
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
  fileBlobId: string | null
  id: string
  name: string
  origin: FileOrigin | null
  ownerType: FileOwnerType
  ownerId: string
  path: string
  type: string
  createdAt: string
}

export interface FileBlob {
  id: string
  contentHash: string
  path: string
  type: string
  size: number
  encryption: FileEncryption | null
  createdAt: string
}

export interface FileAnalysis {
  fileId: string
  kind: string
  status: string
  analyzerVersion: number
  payload: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export type FileOwnerType = 'USER' | 'CHAT' | 'ASSISTANT' | 'TOOL'
export type FileOrigin = 'uploaded' | 'generated'

export interface Image {
  id: string
  data: Buffer
  mimeType: string
}

export interface AssistantVersionFile {
  assistantVersionId: string
  fileId: string
  order: number | null
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
    | 'user-request'
    | 'user-response'
  sentAt: string
  version: number | null
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
  expiresAt: string
  id: string
  userId: string
  createdAt: string
  lastSeenAt: string | null
  userAgent: string | null
  ipAddress: string | null
  authMethod: 'password' | 'idp'
  idpConnectionId: string | null
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
  enabled: number
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

export interface Parameter {
  id: string
  name: string
  description: string
  defaultValue: string | null
  provisioned: number
}

export interface UserParameterValue {
  id: string
  userId: string
  parameterId: string
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
  satelliteId: string | null
  enabled: number
  createdAt: string
  updatedAt: string
}

export interface ToolSharing {
  id: string
  toolId: string
  workspaceId: string
}

export interface MessageFeedback {
  messageId: string
  userId: string
  positive: number // 1 = thumbs up, 0 = thumbs down
  comment: string | null
  createdAt: string
  updatedAt: string
}

export interface MessageAudit {
  messageId: string
  conversationId: string
  userId: string
  assistantId: string
  type:
    | 'user'
    | 'assistant'
    | 'tool'
    | 'tool-auth-request'
    | 'tool-auth-response'
    | 'user-request'
    | 'user-response'
  model: string
  tokens: number
  tokenDetails: string | null
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
  scope: string | null
}

export interface UserSecret {
  id: string
  userId: string
  context: string
  type: string
  label: string
  value: string
  createdAt: string
  updatedAt: string
}

export interface ToolSecret {
  id: string
  toolId: string
  key: string
  value: string
  createdAt: string
  updatedAt: string
}

export interface IdpConnection {
  id: string
  type: 'OIDC' | 'SAML'
  name: string
  description: string
  config: string
}

export interface Satellite {
  id: string
  name: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface CompressedMessage {
  sourceMessageId: string
  compressionVersion: number
  content: string
  version: number | null
  createdAt: string
  updatedAt: string
}

export interface UserTokenWindow {
  userId: string
  tokenWindowStart: string
  tokenWindowAccumulated: number
}

export interface DB {
  Account: Account
  ApiKey: ApiKey
  UserSecret: UserSecret
  ToolSecret: ToolSecret
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
  FileBlob: FileBlob
  FileAnalysis: FileAnalysis
  IdpConnection: IdpConnection
  Image: Image
  Message: Message
  MessageFeedback: MessageFeedback
  MessageAudit: MessageAudit
  Tool: Tool
  ToolSharing: ToolSharing
  Prompt: Prompt
  Property: Property
  Satellite: Satellite
  Session: Session
  CompressedMessage: CompressedMessage
  Workspace: Workspace
  WorkspaceMember: WorkspaceMember
  User: User
  Parameter: Parameter
  UserParameterValue: UserParameterValue
  UserTokenWindow: UserTokenWindow
}
