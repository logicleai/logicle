'use client'
import { LlmModel } from '@/lib/chat/models'
import { useContext } from 'react'
import React from 'react'
import * as dto from '@/types/dto'
import { ENVIRONMENT_ELEMENT_ID, readBootstrapJson } from '@/lib/bootstrapPlaceholders'

export type Environment = {
  appUrl: string
  appVersion: string
  appDisplayName: string
  backendConfigLock: boolean
  ssoConfigLock: boolean
  enableSignup: boolean
  enableAutoSummary: boolean
  enableApiKeysUi: boolean
  enableSatellitesUi: boolean
  enableChatSharing: boolean
  enableChatFolders: boolean
  enableShowToolResult: boolean
  enableChatTreeNavigation: boolean
  enableAssistantInfo: boolean
  enableAssistantDuplicate: boolean
  maxImgAttachmentDimPx: number
  maxAttachmentSize: number
  sessionRefreshIntervalMinutes: number
  sessionRefreshThrottleMinutes: number
  softMessageLimit?: number
  hardMessageLimit?: number
  models: LlmModel[]
  parameters: dto.Parameter[]
  faviconPath?: string
  logoPath?: string
}

export const EnvironmentContext = React.createContext<Environment>({} as Environment)

type Props = {
  children: React.ReactNode
}

// server.ts splices the real payload into a <script id="__logicle_env__">
// tag before sending the HTML, so it's already in the DOM by the time this
// component's lazy initializer runs on the client — no fetch, no waterfall.
export const EnvironmentProvider: React.FC<Props> = ({ children }) => {
  const [value] = React.useState<Environment>(
    () => readBootstrapJson<Environment>(ENVIRONMENT_ELEMENT_ID) ?? ({} as Environment)
  )
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export const useEnvironment = (): Environment => useContext(EnvironmentContext)
