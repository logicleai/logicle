'use client'
import { LlmModel } from '@/lib/chat/models'
import { useContext } from 'react'
import React from 'react'

export type Environment = {
  appUrl: string
  backendConfigLock: boolean
  ssoConfigLock: boolean
  enableSignup: boolean
  enableAutoSummary: boolean
  enableApiKeys: boolean
  enableChatSharing: boolean
  enableChatFolders: boolean
  enableShowToolResult: boolean
  enableChatTreeNavigation: boolean
  maxImgAttachmentDimPx: number
  models: LlmModel[]
}

export const EnvironmentContext = React.createContext<Environment>({} as Environment)

type Props = {
  value: Environment
  children: React.ReactNode
}

export const EnvironmentProvider: React.FC<Props> = ({ children, value }) => {
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export const useEnvironment = (): Environment => useContext(EnvironmentContext)
