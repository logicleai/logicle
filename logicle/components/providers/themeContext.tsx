'use client'
import { useContext, useState } from 'react'
import React from 'react'
import '@/lib/zod/setup'

type Theme = 'dark' | 'light'

type ContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

type Props = {
  children: React.ReactNode
}

const Theme = React.createContext<ContextType>({} as ContextType)

const ThemeProvider: React.FC<Props> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark')

  const modalContext: ContextType = {
    theme: theme,
    setTheme: setTheme,
  }

  return <Theme.Provider value={modalContext}>{children}</Theme.Provider>
}

const useTheme = (): ContextType => useContext(Theme)

export { useTheme }

export default ThemeProvider
