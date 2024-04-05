'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import Members from '../../components/WorkspaceMembers'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import AddMember from '../../components/AddMember'
import { useState } from 'react'
import CreateButton from '@/app/admin/components/CreateButton'

const WorkspaceMembers = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {workspace && (
        <>
          <AdminPageTitle title={`Workspace ${workspace.name} - members`}>
            <CreateButton onClick={() => setAddMemberDialogVisible(true)} />
          </AdminPageTitle>{' '}
          <div className="flex flex-col">
            <Members workspace={workspace} />
          </div>
          <AddMember
            visible={isAddMemberDialogVisible}
            setVisible={setAddMemberDialogVisible}
            workspace={workspace}
          />
        </>
      )}
    </WithLoadingAndError>
  )
}

export default WorkspaceMembers
