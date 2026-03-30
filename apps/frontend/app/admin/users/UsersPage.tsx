'use client'
import { useUsers, mutateUsers } from '@/hooks/users'
import { useTranslation } from 'react-i18next'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_, patch } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useState } from 'react'
import AddUser from './AddUser'
import { Link } from '@/components/ui/link'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconLock, IconLockOpen, IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { useUserProfile } from '@/components/providers/userProfileContext'

const UsersPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: users } = useUsers()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const userProfile = useUserProfile()

  async function onDelete(user: dto.AdminUser) {
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
    toast.success(t('user-deleted'))
  }

  async function onToggleEnabled(user: dto.AdminUser, nextEnabled: boolean) {
    const isDisabling = !nextEnabled
    const confirmed = await modalContext.askConfirmation({
      title: isDisabling ? `${t('disable-user')} ${user.name}` : `${t('enable-user')} ${user.name}`,
      message: t(isDisabling ? 'disable-user-confirmation' : 'enable-user-confirmation'),
      confirmMsg: t(isDisabling ? 'disable-user' : 'enable-user'),
      destructive: isDisabling,
    })
    if (!confirmed) return

    const response = await patch(`/api/users/${user.id}`, { enabled: nextEnabled })
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    await mutateUsers()
    toast.success(t(nextEnabled ? 'user-enabled-successfully' : 'user-disabled-successfully'))
  }

  const columns: Column<dto.AdminUser>[] = [
    column(t('table-column-name'), (user) => (
      <Link variant="ghost" href={`/admin/users/${user.id}`}>
        {user.name}
      </Link>
    )),
    column(t('table-column-email'), (user) => user.email),
    column(t('table-column-user-role'), (user) => t(user.role.toLowerCase())),
    column(t('status'), (user) => t(user.enabled ? 'active' : 'disabled')),
    column(t('table-column-sso-user'), (user) => (
      <div className="text-center">{t(user.ssoUser ? '✔' : '')}</div>
    )),
    column(t('table-column-actions'), (user) => (
      <ActionList>
        <Action
          icon={user.enabled ? IconLock : IconLockOpen}
          onClick={async () => {
            await onToggleEnabled(user, !user.enabled)
          }}
          text={t(user.enabled ? 'disable-user' : 'enable-user')}
          destructive={user.enabled}
          disabled={user.provisioned || userProfile?.id === user.id}
        />
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(user)
          }}
          text={t('remove-user')}
          destructive={true}
          disabled={user.provisioned || userProfile?.id === user.id}
        />
      </ActionList>
    )),
  ]

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={t('users')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
          <Button onClick={() => setShowAddDialog(true)}>{t('create_user')}</Button>
        </SearchBarWithButtonsOnRight>
      }
    >
      <SimpleTable
        className="flex-1"
        columns={columns}
        rows={(users ?? []).filter(
          (u) =>
            searchTerm.trim().length === 0 ||
            (u.name + u.email).toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      {showAddDialog && <AddUser onClose={() => setShowAddDialog(false)}></AddUser>}
    </AdminPage>
  )
}

export default UsersPage
