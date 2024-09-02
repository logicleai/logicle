'use client'
import { useContext } from 'react'
import React from 'react'

export type Environment = {
  backendConfigLock: boolean
  ssoConfigLock: boolean
  enableWorkspaces: boolean
  enableTools: boolean
  enableSignup: boolean
  enableAutoSummary: boolean
  enableChatFileUpload: boolean
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
