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

export type AssistantWithTools = Omit<schema.Assistant, 'imageId' | 'tags' | 'prompts'> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  sharing: Sharing[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
}

export type InsertableAssistant = Omit<
  schema.Assistant,
  'id' | 'imageId' | 'createdAt' | 'updatedAt' | 'tags' | 'prompts' | 'provisioned'
> & {
  tools: AssistantTool[]
  files: AssistantFile[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
}

export type AssistantWithOwner = Omit<schema.Assistant, 'imageId' | 'tags' | 'prompts'> & {
  ownerName: string
  modelName: string
  sharing: Sharing[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
}

export type AssistantUserDataDto = {
  pinned: boolean
  lastUsed?: string
}
