import * as schema from '../../db/schema'
import { Sharing } from './sharing'

export type Assistant = schema.Assistant
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

export type InsertableAssistant = Omit<
  schema.Assistant,
  'id' | 'imageId' | 'createdAt' | 'updatedAt'
> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  iconUri: string | null
}

export type AssistantWithOwner = Omit<schema.Assistant, 'imageId'> & {
  ownerName: string
  sharing: Sharing[]
  iconUri: string | null
}

export type AssistantUserDataDto = {
  pinned: boolean
  lastUsed?: string
}
