import * as db from '@/db/types'

import { Insertable, Selectable, Updateable } from 'kysely'

export type Account = Selectable<db.Account>
export type Assistant = Selectable<db.Assistant>
export type AssistantUserData = Selectable<db.AssistantUserData>
export type Backend = Selectable<db.Backend>
export type Conversation = Selectable<db.Conversation>
export type ConversationFolder = Selectable<db.ConversationFolder>
export type File = Selectable<db.File>
export type Message = Selectable<db.Message>
export type AssistantToolAssociation = Selectable<db.AssistantToolAssociation>
export type Prompt = Selectable<db.Prompt>
export type Property = Selectable<db.Property>
export type Session = Selectable<db.Session>
export type Workspace = Selectable<db.Workspace>
export type WorkspaceMember = Selectable<db.WorkspaceMember>
export type User = Selectable<db.User>
export type UserRole = Selectable<db.UserRole>

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

export type SelectableAssistantWithTools = db.Assistant & {
  tools: AssistantTool[]
  files: AssistantFile[]
}

export type InsertableAssistantWithTools = Omit<SelectableAssistantWithTools, 'id'>

export type InsertableAssistant = Omit<Insertable<db.Assistant>, 'id'>

export type InsertableBackend = Omit<Insertable<db.Backend>, 'id'>
export type InsertableConversation = Omit<Insertable<db.Conversation>, 'id' | 'createdAt'>
export type InsertableConversationFolder = Omit<Insertable<db.ConversationFolder>, 'id'>
export type InsertableMessage = Insertable<db.Message>
export type InsertableUser = Omit<Insertable<db.User>, 'id' | 'createdAt' | 'updatedAt'>
export type InsertablePrompt = Omit<Insertable<db.Prompt>, 'id'>
export type InsertableProperty = Omit<Insertable<db.Property>, 'id'>
export type InsertableFile = Omit<Insertable<db.File>, 'id' | 'createdAt' | 'path' | 'uploaded'>
export type UpdateableUser = Updateable<db.User>

// tools: type may be set only at creation time
export type ToolDTO = Omit<Selectable<db.Tool>, 'configuration'> & {
  configuration: Record<string, any>
}
export type InsertableToolDTO = Omit<ToolDTO, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateableToolDTO = Partial<Omit<ToolDTO, 'id' | 'type' | 'createdAt' | 'updatedAt'>>
export type SelectableFile = Selectable<File>
