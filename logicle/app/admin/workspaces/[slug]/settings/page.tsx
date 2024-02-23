'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import WorkspaceTab from '../../components/WorkspaceTab'
import WorkspaceSettings from '../../components/WorkspaceSettings'

const Settings = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {workspace && (
        <>
          <WorkspaceTab activeTab="settings" workspace={workspace} />
          <WorkspaceSettings workspace={workspace} />
        </>
      )}
    </WithLoadingAndError>
  )
}

export default Settings
