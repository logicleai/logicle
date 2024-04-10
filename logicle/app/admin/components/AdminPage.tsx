import { WithLoadingAndError } from '@/components/ui'
import { ReactNode } from 'react'
import { AdminPageTitle } from './AdminPageTitle'

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
        <AdminPageTitle title={title}></AdminPageTitle>
        {children}
      </div>
    </WithLoadingAndError>
  )
}
