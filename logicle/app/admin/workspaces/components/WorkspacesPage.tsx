'use client'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { useWorkspaces, mutateWorkspaces } from '@/hooks/workspaces'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Link } from '@/components/ui/link'
import CreateWorkspace from './CreateWorkspace'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AdminPage } from '../../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

const WorkspacesPage = () => {
  const [createDialogVisible, setCreateDialogVisible] = useState(false)
  const { t } = useTranslation()
  const { isLoading, error, data: workspaces } = useWorkspaces()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const modalContext = useConfirmationContext()
  async function onDelete(workspace: dto.WorkspaceWithMemberCount) {
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
    await mutateWorkspaces()
    toast.success(t('workspace-deleted'))
  }

  const columns: Column<dto.WorkspaceWithMemberCount>[] = [
    column(t('table-column-name'), (workspace: dto.WorkspaceWithMemberCount) => (
      <Link variant="ghost" href={`/admin/workspaces/${workspace.id}`}>
        {workspace.name}
      </Link>
    )),
    column(t('table-column-members'), (workspace: dto.WorkspaceWithMemberCount) => (
      <>{`${workspace.memberCount}`}</>
    )),
    column(t('table-column-created-at'), (workspace: dto.WorkspaceWithMemberCount) =>
      new Date(workspace.createdAt).toLocaleString()
    ),
    column(t('table-column-actions'), (workspace: dto.WorkspaceWithMemberCount) => (
      <div className="flex flex-col items-start gap-3">
        <ActionList>
          <Action
            icon={IconTrash}
            onClick={async () => {
              await onDelete(workspace)
            }}
            text={t('remove-workspace')}
            destructive={true}
          />
        </ActionList>
      </div>
    )),
  ]

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-workspaces')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setCreateDialogVisible(true)}>{t('create-workspace')}</Button>
      </SearchBarWithButtonsOnRight>
      <SimpleTable
        columns={columns}
        rows={(workspaces ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 || u.name.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      {createDialogVisible && <CreateWorkspace onClose={() => setCreateDialogVisible(false)} />}
    </AdminPage>
  )
}

export default WorkspacesPage
