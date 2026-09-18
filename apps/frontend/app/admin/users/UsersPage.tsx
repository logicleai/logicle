'use client'
import { useUsers, mutateUsers } from '@/hooks/users'
import { useTranslation } from 'react-i18next'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_, patch } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useState } from 'react'
import AddUser from './AddUser'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconLock, IconLockOpen, IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

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
      <a
        href={`/admin/users/${user.id}`}
        className="flex min-w-[220px] items-center gap-3 text-left hover:text-primary"
      >
        <Avatar size="default" fallback={user.name} fallbackColor={undefined} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </a>
    )),
    column(t('table-column-user-role'), (user) => (
      <Badge variant={user.role === dto.UserRole.ADMIN ? 'default' : 'secondary'}>
        {t(user.role.toLowerCase())}
      </Badge>
    )),
    column(t('status'), (user) => (
      <span className="inline-flex items-center gap-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            user.enabled ? 'bg-emerald-500' : 'bg-muted-foreground'
          }`}
        />
        {t(user.enabled ? 'active' : 'disabled')}
      </span>
    )),
    column(t('table-column-sso-user'), (user) => (
      <div className="text-center text-emerald-600">{user.ssoUser ? '✓' : '—'}</div>
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
          <Button onClick={() => setShowAddDialog(true)}>{t('create-user')}</Button>
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
