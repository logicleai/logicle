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

export type SelectableAssistantWithTools = schema.Assistant & {
  tools: AssistantTool[]
  files: AssistantFile[]
  sharing: Sharing[]
}

export type InsertableAssistant = Omit<schema.Assistant, 'id' | 'imageId'> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  icon: string | null
}

export type SelectableAssistantWithOwner = schema.Assistant & {
  ownerName: string | null
  sharing: Sharing[]
}

export type AssistantUserDataDto = {
  pinned: boolean
  lastUsed?: string
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
