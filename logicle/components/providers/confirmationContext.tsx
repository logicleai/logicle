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
    return new Promise(function (resolve) {
      resolver.current = resolve
    })
  }

  const modalContext: ContextType = {
    askConfirmation: handleShow,
  }

  const handleOk = () => {
    resolver.current && resolver.current(true)
    setContent(undefined)
  }

  const handleCancel = () => {
    resolver.current && resolver.current(false)
    setContent(undefined)
  }

  return (
    <ConfirmationContext.Provider value={modalContext}>
      {props.children}
      {content && (
        <div className={theme.theme}>
          <ConfirmationDialog
            visible={true}
            title={content.title}
            onCancel={handleCancel}
            onConfirm={handleOk}
            confirmText={content.confirmMsg ?? 'Confirm'}
            destructive={content.destructive ?? true}
            icon={<IconTrash stroke="1" className="text-destructive"></IconTrash>}
          >
            {content.message}
          </ConfirmationDialog>
        </div>
      )}
    </ConfirmationContext.Provider>
  )
}

const useConfirmationContext = (): ContextType => useContext(ConfirmationContext)

export { useConfirmationContext }

export default ConfirmationContextProvider
