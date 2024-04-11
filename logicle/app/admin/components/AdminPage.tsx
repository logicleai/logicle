import { WithLoadingAndError } from '@/components/ui'
import { ReactNode } from 'react'

interface Props {
  isLoading?: boolean
  error?: Error
  title: string
  children: ReactNode
}

export const AdminPage = ({ children, title, isLoading, error }: Props) => {
  return (
    <WithLoadingAndError isLoading={isLoading || false} error={error}>
      <div className="h-full flex flex-col max-w-6xl m-auto">
        <h1 className="flex gap-3 items-center mb-4">
          <span>{title}</span>
        </h1>
        {children}
      </div>
    </WithLoadingAndError>
  )
}
