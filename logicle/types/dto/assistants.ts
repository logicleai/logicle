import * as schema from '../../db/schema'
import { Sharing } from './sharing'

export interface AssistantTool {
  id: string
  name: string
  capability: number
  provisioned: number
}

export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
}

export type AssistantDraft = Omit<schema.AssistantVersion, 'imageId' | 'tags' | 'prompts'> & {
  owner: string
  tools: string[]
  files: AssistantFile[]
  sharing: Sharing[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
  provisioned: number
}

export type InsertableAssistant = Omit<
  AssistantDraft,
  'id' | 'createdAt' | 'updatedAt' | 'owner' | 'sharing' | 'provisioned' | 'assistantId'
>

export type UpdateableAssistant = Partial<InsertableAssistant>

export type AssistantWithOwner = Omit<schema.AssistantVersion, 'imageId' | 'tags' | 'prompts'> & {
  owner: string
  ownerName: string
  modelName: string
  sharing: Sharing[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
  provisioned: number
}

export type AssistantUserData = {
  pinned: boolean
  lastUsed: string | null
}

export type InsertableAssistantUserData = {
  pinned: boolean
}
