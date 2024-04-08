'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import WorkspaceSettings from '../../components/WorkspaceSettings'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'

const Settings = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {workspace && (
        <>
          <AdminPageTitle title={`Workspace ${workspace.name} - settings`} />
          <WorkspaceSettings workspace={workspace} />
        </>
      )}
    </WithLoadingAndError>
  )
}

export default Settings
