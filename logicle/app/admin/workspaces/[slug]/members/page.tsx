'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import WorkspaceTab from '../../components/WorkspaceTab'
import Members from '../../components/WorkspaceMembers'

const WorkspaceMembers = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {workspace && (
        <>
          <WorkspaceTab activeTab="members" workspace={workspace} />
          <div className="flex flex-col">
            <Members workspace={workspace} />
          </div>
        </>
      )}
    </WithLoadingAndError>
  )
}

export default WorkspaceMembers
