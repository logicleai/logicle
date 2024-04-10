'use client'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import AddMember from '../../components/AddMember'
import { useState } from 'react'
import { WorkspaceMembers } from '../../components/WorkspaceMembers'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { useTranslation } from 'react-i18next'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'

const WorkspaceMembersPage = () => {
  const { t } = useTranslation()
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: workspace } = useWorkspace(slug)
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={`Workspace ${workspace?.name ?? ''} - members`}
    >
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setAddMemberDialogVisible(true)}>{t('Add member')}</Button>
      </SearchBarWithButtonsOnRight>
      {workspace && (
        <>
          <div className="flex flex-col">
            <WorkspaceMembers workspace={workspace} filter={searchTerm} />
          </div>
          <AddMember
            visible={isAddMemberDialogVisible}
            setVisible={setAddMemberDialogVisible}
            workspace={workspace}
          />
        </>
      )}
    </AdminPage>
  )
}

export default WorkspaceMembersPage
