'use client'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { useWorkspaces, mutateWorkspaces } from '@/hooks/workspaces'
import { WithLoadingAndError } from '@/components/ui'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { WorkspaceWithMemberCount } from '@/types/workspace'
import DeleteButton from '../components/DeleteButton'
import { Link } from '@/components/ui/link'
import CreateButton from '../components/CreateButton'
import CreateWorkspace from './components/CreateWorkspace'

export const dynamic = 'force-dynamic'

const WorkspacesPage = () => {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation('common')
  const { isLoading, error, data: workspaces } = useWorkspaces()

  const modalContext = useConfirmationContext()
  async function onDelete(workspace: WorkspaceWithMemberCount) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-workspace')} ${workspace.name}`,
      message: <p>{t('remove-workspace-confirmation')}</p>,
      confirmMsg: t('remove-workspace'),
    })
    if (!result) return

    const response = await delete_<void>(`/api/workspaces/${workspace.slug}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateWorkspaces()
    toast.success(t('workspace-deleted'))
  }

  const columns: Column<WorkspaceWithMemberCount>[] = [
    column(t('table-column-name'), (workspace: WorkspaceWithMemberCount) => (
      <Link variant="ghost" href={`/admin/workspaces/${workspace.slug}/members`}>
        {workspace.name}
      </Link>
    )),
    column(t('table-column-members'), (workspace: WorkspaceWithMemberCount) => `${workspace.memberCount}`),
    column(t('table-column-created-at'), (workspace: WorkspaceWithMemberCount) =>
      new Date(workspace.createdAt).toLocaleString()
    ),
    column(t('table-column-actions'), (workspace: WorkspaceWithMemberCount) => (
      <DeleteButton
        onClick={() => {
          onDelete(workspace)
        }}
      >
        {t('remove-workspace')}
      </DeleteButton>
    )),
  ]

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <AdminPageTitle title={t('all-workspaces')}>
        <CreateButton onClick={() => setVisible(true)} />
      </AdminPageTitle>
      <SimpleTable columns={columns} rows={workspaces ?? []} keygen={(t) => t.id} />
      <CreateWorkspace visible={visible} setVisible={setVisible} />
    </WithLoadingAndError>
  )
}

export default WorkspacesPage