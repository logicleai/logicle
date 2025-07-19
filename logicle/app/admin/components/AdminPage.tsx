import { WithLoadingAndError } from '@/components/ui'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ReactNode } from 'react'

interface Props {
  className?: string
  isLoading?: boolean
  error?: Error
  title: string
  children: ReactNode
  headerActions?: React.ReactNode
  topBar?: React.ReactNode
}

export const AdminPage = ({ headerActions, topBar, children, title, isLoading, error }: Props) => {
  return (
    <WithLoadingAndError isLoading={isLoading || false} error={error}>
      <ScrollArea className="h-full flex-1 px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="sticky top-0 bg-white z-10">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="flex gap-3">
                <span>{title}</span>
              </h1>
              {headerActions && <div className="flex gap-2">{headerActions}</div>}
            </div>
            {topBar}
          </div>
          {children}
        </div>
      </ScrollArea>
    </WithLoadingAndError>
  )
}
