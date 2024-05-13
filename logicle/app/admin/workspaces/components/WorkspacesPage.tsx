'use client'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { useWorkspaces, mutateWorkspaces } from '@/hooks/workspaces'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { WorkspaceWithMemberCount } from '@/types/workspace'
import { Link } from '@/components/ui/link'
import CreateWorkspace from './CreateWorkspace'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AdminPage } from '../../components/AdminPage'
import { ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

const WorkspacesPage = () => {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation('common')
  const { isLoading, error, data: workspaces } = useWorkspaces()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const modalContext = useConfirmationContext()
  async function onDelete(workspace: WorkspaceWithMemberCount) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-workspace')} ${workspace.name}`,
      message: t('remove-workspace-confirmation'),
      confirmMsg: t('remove-workspace'),
    })
    if (!result) return

    const response = await delete_<void>(`/api/workspaces/${workspace.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateWorkspaces()
    toast.success(t('workspace-deleted'))
  }

  const columns: Column<WorkspaceWithMemberCount>[] = [
    column(t('table-column-name'), (workspace: WorkspaceWithMemberCount) => (
      <Link variant="ghost" href={`/admin/workspaces/${workspace.id}`}>
        {workspace.name}
      </Link>
    )),
    column(t('table-column-members'), (workspace: WorkspaceWithMemberCount) => (
      <>{`${workspace.memberCount}`}</>
    )),
    column(t('table-column-created-at'), (workspace: WorkspaceWithMemberCount) =>
      new Date(workspace.createdAt).toLocaleString()
    ),
    column(t('table-column-actions'), (workspace: WorkspaceWithMemberCount) => (
      <div className="flex flex-col items-start gap-3">
        <ActionList
          actions={[
            {
              icon: IconTrash,
              onClick: () => {
                onDelete(workspace)
              },
              text: t('remove-workspace'),
              destructive: true,
            },
          ]}
        />
      </div>
    )),
  ]

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-workspaces')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setVisible(true)}>{t('create-workspace')}</Button>
      </SearchBarWithButtonsOnRight>
      <SimpleTable
        columns={columns}
        rows={(workspaces ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 || u.name.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      <CreateWorkspace visible={visible} setVisible={setVisible} />
    </AdminPage>
  )
}

export default WorkspacesPage
