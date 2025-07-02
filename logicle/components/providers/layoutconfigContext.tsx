'use client'
import { useContext, useState } from 'react'
import React from 'react'

type ContextType = {
  showSidebar: boolean
  setShowSidebar: (show: boolean) => void
}

type Props = {
  children: React.ReactNode
}

const LayoutConfig = React.createContext<ContextType>({} as ContextType)

const LayoutConfigProvider: React.FC<Props> = ({ children }) => {
  const [showSidebar, setShowSidebar] = useState<boolean>(true)

  const context: ContextType = {
    showSidebar,
    setShowSidebar,
  }

  return <LayoutConfig.Provider value={context}>{children}</LayoutConfig.Provider>
}

const useLayoutConfig = (): ContextType => useContext(LayoutConfig)

export { useLayoutConfig }

export default LayoutConfigProvider
