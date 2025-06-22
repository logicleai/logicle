import { WithLoadingAndError } from '@/components/ui'
import { ReactNode } from 'react'

interface Props {
  className?: string
  isLoading?: boolean
  error?: Error
  title: string
  children: ReactNode
}

export const AdminPage = ({ className, children, title, isLoading, error }: Props) => {
  return (
    <WithLoadingAndError isLoading={isLoading || false} error={error}>
      <div className="h-full flex flex-col max-w-6xl m-auto px-4 py-6 lg:px-8">
        <h1 className="flex gap-3 items-center mb-4">
          <span>{title}</span>
        </h1>
        {children}
      </div>
    </WithLoadingAndError>
  )
}
