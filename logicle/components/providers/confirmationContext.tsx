'use client'
import { useContext, useRef, useState } from 'react'
import ConfirmationDialog from '@/components/ui/ConfirmationDialog'
import React from 'react'
import { useTheme } from './themeContext'
import { IconTrash } from '@tabler/icons-react'

interface ModalContextParams {
  title: string
  message: string | JSX.Element
  confirmMsg?: string
  destructive?: boolean
}

type ContextType = {
  askConfirmation: (params: ModalContextParams) => Promise<boolean>
}

type ContextProviderProps = {
  children: React.ReactNode
}

const ConfirmationContext = React.createContext<ContextType>({} as ContextType)

const ConfirmationContextProvider: React.FC<ContextProviderProps> = (props) => {
  const theme = useTheme()
  const [content, setContent] = useState<ModalContextParams | undefined>()
  const resolver = useRef<(arg: boolean) => void>()

  const handleShow = (params: ModalContextParams): Promise<boolean> => {
    setContent(params)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }

  const modalContext: ContextType = {
    askConfirmation: handleShow,
  }

  const handleOk = () => {
    resolver.current?.(true)
    setContent(undefined)
  }

  const handleCancel = () => {
    resolver.current?.(false)
    setContent(undefined)
  }

  return (
    <ConfirmationContext.Provider value={modalContext}>
      {props.children}
      {content && (
        <div className={theme.theme}>
          <ConfirmationDialog
            title={content.title}
            onCancel={handleCancel}
            onConfirm={handleOk}
            confirmText={content.confirmMsg ?? 'Confirm'}
            destructive={content.destructive ?? true}
            icon={<IconTrash stroke="1" className="text-destructive"></IconTrash>}
          >
            <div className="text-center text-muted-foreground">{content.message}</div>
          </ConfirmationDialog>
        </div>
      )}
    </ConfirmationContext.Provider>
  )
}

const useConfirmationContext = (): ContextType => useContext(ConfirmationContext)

export { useConfirmationContext }

export default ConfirmationContextProvider
