import * as schema from '@/db/schema'

import { Updateable } from 'kysely'

export type Account = schema.Account
export type Assistant = schema.Assistant
export type AssistantUserData = schema.AssistantUserData
export type Backend = schema.Backend
export type Conversation = schema.Conversation
export type ConversationFolder = schema.ConversationFolder
export type File = schema.File
export type Message = schema.Message
export type AssistantToolAssociation = schema.AssistantToolAssociation
export type Prompt = schema.Prompt
export type Property = schema.Property
export type Session = schema.Session
export type Workspace = schema.Workspace
export type WorkspaceMember = schema.WorkspaceMember

interface AllSharingType {
  type: 'all'
}

interface WorkspaceSharingType {
  type: 'workspace'
  workspaceId: string
  workspaceName: string
}

export type Sharing = AllSharingType | WorkspaceSharingType

export type InsertableSharing = AllSharingType | Omit<WorkspaceSharingType, 'workspaceName'>

export interface AssistantTool {
  id: string
  name: string
  enabled: boolean
}
export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
}

export type AssistantWithTools = Omit<schema.Assistant, 'imageId'> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  sharing: Sharing[]
  iconUri: string | null
}

export type InsertableAssistant = Omit<schema.Assistant, 'id' | 'imageId'> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  iconUri: string | null
}

export type AssistantWithOwner = Omit<schema.Assistant, 'imageId'> & {
  ownerName: string | null
  sharing: Sharing[]
  iconUri: string | null
}

export type AssistantUserDataDto = {
  pinned: boolean
  lastUsed?: string
}

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
export type UpdateableUser = Updateable<schema.User>
