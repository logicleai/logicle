import * as schema from '../../db/schema'
import { z } from 'zod'
import { Sharing } from './sharing'
import {
  assistantDraftSchema,
  insertableAssistantDraftSchema,
  updateableAssistantDraftSchema,
} from '../validation/assistant'

export interface AssistantTool {
  id: string
  name: string
  capability: number
  provisioned: number
  visible: boolean
}

export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
}

export type AssistantVersion = schema.AssistantVersion & {
  current: boolean
  published: boolean
}

export type AssistantDraft = z.infer<typeof assistantDraftSchema>

export type InsertableAssistantDraft = z.infer<typeof insertableAssistantDraftSchema>

export type UpdateableAssistantDraft = z.infer<typeof updateableAssistantDraftSchema>

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

export type InsertableAssistantDraftUserData = {
  pinned: boolean
}
