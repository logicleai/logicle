'use client'
import { useContext, useState } from 'react'
import React from 'react'

type Theme = 'dark' | 'light'

type ModalContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

type Props = {
  children: React.ReactNode
}

const Theme = React.createContext<ModalContextType>({} as ModalContextType)

const ThemeProvider: React.FC<Props> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark')

  const modalContext: ModalContextType = {
    theme: theme,
    setTheme: setTheme,
  }

  return <Theme.Provider value={modalContext}>{children}</Theme.Provider>
}

const useTheme = (): ModalContextType => useContext(Theme)

export { useTheme }

export default ThemeProvider
