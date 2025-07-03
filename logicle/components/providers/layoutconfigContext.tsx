'use client'
import { useContext, useEffect, useState } from 'react'
import React from 'react'

type ContextType = {
  showSidebar: boolean
  isMobile: boolean
  setShowSidebar: (show: boolean) => void
}

type Props = {
  children: React.ReactNode
}

/**
 * Modified from link below
 * @see https://observablehq.com/@werehamster/avoiding-hydration-mismatch-when-using-react-hooks
 * @param mediaQueryString
 * @returns {boolean}
 */
function useBetterMediaQuery(mediaQueryString): boolean {
  const [matches, setMatches] = useState<boolean>(undefined!)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(mediaQueryString)
    const listener = () => setMatches(!!mediaQueryList.matches)
    listener()
    mediaQueryList.addEventListener('change', listener)
    return () => mediaQueryList.removeEventListener('change', listener)
  }, [mediaQueryString])

  return matches
}

const LayoutConfig = React.createContext<ContextType>({} as ContextType)

const LayoutConfigProvider: React.FC<Props> = ({ children }) => {
  const [showSidebar, setShowSidebar] = useState<boolean>(true)
  const isMobile = useBetterMediaQuery('(max-width: 768px)')

  const context: ContextType = {
    isMobile,
    showSidebar,
    setShowSidebar,
  }

  return <LayoutConfig.Provider value={context}>{children}</LayoutConfig.Provider>
}

const useLayoutConfig = (): ContextType => useContext(LayoutConfig)

export { useLayoutConfig }

export default LayoutConfigProvider
