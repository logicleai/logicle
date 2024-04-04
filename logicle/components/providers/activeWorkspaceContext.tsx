'use client'
import { useContext, useState } from 'react'
import React from 'react'

type Props = {
  children: React.ReactNode
}

interface Workspace {
  id: string
  name: string
}

type ContextType = {
  workspace: Workspace | undefined
  selectWorkspace: (workspace: Workspace | undefined) => Promise<void>
}

const ActiveWorkspaceContext = React.createContext<ContextType>({} as ContextType)

const getWorkspaceFromLocalStorage = (): Workspace | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const w = localStorage.getItem('activeWorkspace')
    return w ? JSON.parse(w) : undefined
  } catch (e) {
    console.log('Failed parsing workspace')
  }
}

const ActiveWorkspaceProvider: React.FC<Props> = ({ children }) => {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | undefined>(
    getWorkspaceFromLocalStorage()
  )

  const doSetActiveWorkspace = async (workspace: Workspace | undefined) => {
    if (typeof window !== 'undefined') {
      if (workspace) localStorage.setItem('activeWorkspace', JSON.stringify(workspace))
      else localStorage.removeItem('activeWorkspace')
    }
    setActiveWorkspace(workspace)
  }
  return (
    <ActiveWorkspaceContext.Provider
      value={{
        workspace: activeWorkspace,
        selectWorkspace: doSetActiveWorkspace,
      }}
    >
      {children}
    </ActiveWorkspaceContext.Provider>
  )
}

const useActiveWorkspace = (): ContextType => useContext(ActiveWorkspaceContext)

export { useActiveWorkspace }

export default ActiveWorkspaceProvider
