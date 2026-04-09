import { LlmModel } from '@/lib/chat/models'
export { UserRole } from './dto/user'

export * from './dto/auth'
export * from './dto/chat'
export * from './dto/sharing'
export * from './dto/assistant'
export * from './dto/user'
export * from './dto/stats'
export * from './dto/sso'
export * from './dto/file'
export * from './dto/file-analysis'
export * from './dto/backend'
export * from './dto/tool'
export * from './dto/apikey'
export * from './dto/prompt'
export * from './dto/property'
export * from './dto/conversationfolder'
export * from './dto/parameter'
export * from './dto/workspace'
export * from './dto/userpreferences'
export * from './dto/session'
export * from './dto/usersecret'
export * from './dto/tokenestimate'
export * from './dto/docx-export'

export interface Account {
  access_token: string | null
  expires_at: number | null
  expires_in: number | null
  id: string
  id_token: string | null
  provider: string
  providerAccountId: string
  refresh_token: string | null
  scope: string | null
  session_state: string | null
  token_type: string | null
  type: string
  userId: string
}

export interface Session {
  expiresAt: string
  id: string
  userId: string
  createdAt: string
  lastSeenAt: string | null
  userAgent: string | null
  ipAddress: string | null
  authMethod: 'password' | 'idp'
  idpConnectionId: string | null
}

export interface UserParameterValue {
  id: string
  userId: string
  parameterId: string
  value: string
}

export interface BackendModels {
  backendId: string
  backendName: string
  models: LlmModel[]
}
