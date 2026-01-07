import * as schema from '@/db/schema'
import { LlmModel } from '@/lib/chat/models'
export { UserRole } from '@/db/schema'

export * from './dto/auth'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistant'
export * from './dto/user'
export * from './dto/stats'
export * from './dto/sso'
export * from './dto/file'
export * from './dto/backend'
export * from './dto/tool'
export * from './dto/apikey'
export * from './dto/prompt'
export * from './dto/property'
export * from './dto/conversationfolder'
export * from './dto/parameter'
export * from './dto/workspace'
export * from './dto/userpreferences'

export type Account = schema.Account

export type Session = schema.Session

export type UserParameterValue = schema.UserParameterValue

export interface BackendModels {
  backendId: string
  backendName: string
  models: LlmModel[]
}
