'use client'
import { LlmModel } from '@/lib/chat/models'
import { useContext, useEffect } from 'react'
import React from 'react'
import * as dto from '@/types/dto'
import { get } from '@/lib/fetch'
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

// Safe to render with before any real payload is available (production:
// briefly, before hydration reads the spliced-in script tag; dev: until the
// /api/environment fetch below resolves) — array/boolean fields default to
// empty/false rather than being left `undefined`, so consumers like
// `environment.models.find(...)` don't need to guard against this state.
const DEFAULT_ENVIRONMENT: Environment = {
  appUrl: '',
  appVersion: '',
  appDisplayName: '',
  backendConfigLock: false,
  ssoConfigLock: false,
  enableSignup: false,
  enableAutoSummary: false,
  enableApiKeysUi: false,
  enableSatellitesUi: false,
  enableChatSharing: false,
  enableChatFolders: false,
  enableShowToolResult: false,
  enableChatTreeNavigation: false,
  enableAssistantInfo: false,
  enableAssistantDuplicate: false,
  maxImgAttachmentDimPx: 0,
  maxAttachmentSize: 0,
  sessionRefreshIntervalMinutes: 0,
  sessionRefreshThrottleMinutes: 0,
  models: [],
  parameters: [],
}

export const EnvironmentContext = React.createContext<Environment>(DEFAULT_ENVIRONMENT)

type Props = {
  children: React.ReactNode
}

// In production, server.ts splices the real payload into a
// <script id="__logicle_env__"> tag before sending the HTML, so it's
// already in the DOM by the time this component's lazy initializer runs on
// the client — no fetch, no waterfall. `next dev` (apps/frontend/dev.ts and
// server.ts's dev-mode nextApp) serves layout.tsx directly with no
// injection point, so fall back to fetching the same payload from the API.
export const EnvironmentProvider: React.FC<Props> = ({ children }) => {
  const [value, setValue] = React.useState<Environment>(
    () => readBootstrapJson<Environment>(ENVIRONMENT_ELEMENT_ID) ?? DEFAULT_ENVIRONMENT
  )

  useEffect(() => {
    if (readBootstrapJson<Environment>(ENVIRONMENT_ELEMENT_ID)) return
    void get<Environment>('/api/environment').then((res) => {
      if (!res.error) setValue(res.data)
    })
  }, [])

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export const useEnvironment = (): Environment => useContext(EnvironmentContext)
