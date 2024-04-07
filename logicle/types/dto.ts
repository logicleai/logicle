import * as schema from '@/db/schema'

import { Insertable, Selectable, Updateable } from 'kysely'

export type Account = Selectable<schema.Account>
export type Assistant = Selectable<schema.Assistant>
export type AssistantUserData = Selectable<schema.AssistantUserData>
export type Backend = Selectable<schema.Backend>
export type Conversation = Selectable<schema.Conversation>
export type ConversationFolder = Selectable<schema.ConversationFolder>
export type File = Selectable<schema.File>
export type Message = Selectable<schema.Message>
export type AssistantToolAssociation = Selectable<schema.AssistantToolAssociation>
export type Prompt = Selectable<schema.Prompt>
export type Property = Selectable<schema.Property>
export type Session = Selectable<schema.Session>
export type Workspace = Selectable<schema.Workspace>
export type WorkspaceMember = Selectable<schema.WorkspaceMember>
export type User = Selectable<schema.User>
export type UserRole = Selectable<schema.UserRole>

interface BasicSharingType {
  type: 'none' | 'all'
}

interface WorkspaceSharingType {
  type: 'workspace'
  workspaceId: string
  workspaceName: string
}

export type Sharing = BasicSharingType | WorkspaceSharingType

export type InsertableSharing = BasicSharingType | Omit<WorkspaceSharingType, 'workspaceName'>

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

export type SelectableAssistantWithTools = schema.Assistant & {
  tools: AssistantTool[]
  files: AssistantFile[]
  sharing: Sharing[]
}

export type InsertableAssistant = Omit<schema.Assistant, 'id'> & {
  tools: AssistantTool[]
  files: AssistantFile[]
}

export type SelectableAssistantWithOwner = schema.Assistant & {
  ownerName: string | null
  sharing: Sharing[]
}

export type InsertableBackend = Omit<Insertable<schema.Backend>, 'id'>
export type InsertableConversation = Omit<Insertable<schema.Conversation>, 'id' | 'createdAt'>
export type InsertableConversationFolder = Omit<Insertable<schema.ConversationFolder>, 'id'>
export type InsertableMessage = Insertable<schema.Message>
export type InsertableUser = Omit<Insertable<schema.User>, 'id' | 'createdAt' | 'updatedAt'>
export type InsertablePrompt = Omit<Insertable<schema.Prompt>, 'id'>
export type InsertableProperty = Omit<Insertable<schema.Property>, 'id'>
export type InsertableFile = Omit<Insertable<schema.File>, 'id' | 'createdAt' | 'path' | 'uploaded'>
export type UpdateableUser = Updateable<schema.User>

// tools: type may be set only at creation time
export type ToolDTO = Omit<Selectable<schema.Tool>, 'configuration'> & {
  configuration: Record<string, any>
}
export type InsertableToolDTO = Omit<ToolDTO, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateableToolDTO = Partial<Omit<ToolDTO, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
export type SelectableFile = Selectable<File>
