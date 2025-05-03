import * as schema from '../../db/schema'
import { Sharing } from './sharing'

export type Assistant = schema.Assistant

export interface AssistantTool {
  id: string
  name: string
  enabled: boolean
  capability: number
  provisioned: number
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
  provisioned: number
}

export type InsertableAssistant = Omit<
  schema.Assistant,
  'id' | 'imageId' | 'createdAt' | 'updatedAt' | 'tags' | 'prompts' | 'provisioned' | 'deleted'
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

export type AssistantUserData = {
  pinned: boolean
  lastUsed: string | null
}

export type InsertableAssistantUserData = {
  pinned: boolean
}
