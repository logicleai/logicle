'use client'
import { useUsers, mutateUsers } from '@/hooks/users'
import { useTranslation } from 'next-i18next'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import AddUser from './AddUser'
import { Link } from '@/components/ui/link'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'

const UsersPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: users } = useUsers()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const session = useSession()
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')

  async function onDelete(user: dto.User) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-user')} ${user?.name}`,
      message: t('remove-user-confirmation'),
      confirmMsg: t('remove-user'),
    })
    if (!result) return

    const response = await delete_(`/api/users/${user.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateUsers()
    await session.update()
    toast.success(t('user-deleted'))
  }

  const columns: Column<dto.User>[] = [
    column(t('table-column-name'), (user) => (
      <Link variant="ghost" href={`/admin/users/${user.id}`}>
        {user.name}
      </Link>
    )),
    column(t('table-column-email'), (user) => user.email),
    column(t('table-column-user-role'), (user) => t(user.role.toLowerCase())),
    column(t('table-column-actions'), (user) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(user)
          }}
          text={t('remove-user')}
          destructive={true}
        />
      </ActionList>
    )),
  ]

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-users')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setShowAddDialog(true)}>{t('create_user')}</Button>
      </SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1"
        columns={columns}
        rows={(users ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 ||
            (u.name + u.email).toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      {showAddDialog && <AddUser onClose={() => setShowAddDialog(false)}></AddUser>}
    </AdminPage>
  )
}

export default UsersPage
