import { ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WorkspaceSettingsDialog } from './WorkspaceSettingsDialog'
import { Prop, PropList } from '@/components/ui/proplist'
import { useWorkspace } from '@/hooks/workspaces'
import { Error } from '@/components/ui'
import ContentLoader from 'react-content-loader'

export const LoadFeedBack = ({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean
  error?: Error
  children: ReactNode | ReactNode[]
}) => {
  if (error) {
    return <Error message={error.message} />
  }
  if (isLoading) {
    return <ContentLoader>{children}</ContentLoader>
  }
  return <></>
}

export const WorkspaceSettings = ({ workspaceId }: { workspaceId: string }) => {
  const [editing, setEditing] = useState<boolean>(false)
  const { isLoading, error, data: workspace } = useWorkspace(workspaceId)
  return (
    <Card className="text-body1 space-y-3 p-2">
      {workspace ? (
        <>
          <PropList>
            <Prop label="Name">{workspace.name}</Prop>
            <Prop label="Slug">{workspace.slug}</Prop>
          </PropList>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <WorkspaceSettingsDialog
            workspace={workspace}
            opened={editing}
            onClose={() => setEditing(false)}
          ></WorkspaceSettingsDialog>
        </>
      ) : (
        <LoadFeedBack isLoading={isLoading} error={error}>
          <rect x="0" y="0" rx="5" ry="5" width="70" height="70" />
          <rect x="80" y="17" rx="4" ry="4" width="300" height="13" />
          <rect x="80" y="40" rx="3" ry="3" width="250" height="10" />
        </LoadFeedBack>
      )}
    </Card>
  )
}
