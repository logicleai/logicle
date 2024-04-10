'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import WorkspaceSettings from '../../components/WorkspaceSettings'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { AdminPage } from '@/app/admin/components/AdminPage'

const Settings = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={`Workspace ${workspace?.name ?? ''} - settings`}
    >
      {workspace && (
        <>
          <WorkspaceSettings workspace={workspace} />
        </>
      )}
    </AdminPage>
  )
}

export default Settings
