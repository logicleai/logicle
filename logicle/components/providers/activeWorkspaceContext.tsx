'use client'
import { useContext, useState } from 'react'
import React from 'react'

type Props = {
  children: React.ReactNode
}

type ContextType = {
  workspace: string | undefined
  selectWorkspace: (workspace: string) => void
}

const ActiveWorkspaceContext = React.createContext<ContextType>({} as ContextType)

const ActiveWorkspaceProvider: React.FC<Props> = ({ children }) => {
  const [activeWorkspace, setActiveWorkspace] = useState<string | undefined>(
    typeof window !== 'undefined' ? localStorage.getItem('activeWorkspace') ?? undefined : undefined
  )
  return (
    <ActiveWorkspaceContext.Provider
      value={{
        workspace: activeWorkspace,
        selectWorkspace: setActiveWorkspace,
      }}
    >
      {children}
    </ActiveWorkspaceContext.Provider>
  )
}

const useActiveWorkspace = (): ContextType => useContext(ActiveWorkspaceContext)

export { useActiveWorkspace }

export default ActiveWorkspaceProvider
