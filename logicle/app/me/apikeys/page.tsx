'use client'
import { useUsers, mutateUsers } from '@/hooks/users'
import { useTranslation } from 'react-i18next'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { useSWRJson } from '@/hooks/swr'
import { mutateApiKeys } from '@/hooks/apiKeys'

const UsersPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: apiKeys } = useSWRJson<dto.ApiKey[]>("/api/user/apikeys")
  const [showAddDialog, setShowAddDialog] = useState(false)
  const session = useSession()
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')

  async function onDelete(apikey: dto.ApiKey) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-apikey')} ${apikey?.id}`,
      message: t('remove-apikey-confirmation'),
      confirmMsg: t('remove-apikey'),
    })
    if (!result) return

    const response = await delete_(`/api/user/apikeys/${apikey.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateApiKeys(session.data!.user.id)
    toast.success(t('apikey-deleted'))
  }

  const columns: Column<dto.ApiKey>[] = [
    column(t('table-column-name'), (apiKey) => apiKey.description),
    column(t('table-column-id'), (apiKey) => apiKey.id),
    column(t('table-column-name'), (apiKey) => apiKey.key),
    column(t('table-column-actions'), (apiKey) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(apiKey)
          }}
          text={t('remove-apikey')}
          destructive={true}
        />
      </ActionList>
    )),
  ]

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={t('all-users')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
          <Button onClick={() => setShowAddDialog(true)}>{t('create_user')}</Button>
        </SearchBarWithButtonsOnRight>
      }
    >
      <SimpleTable
        className="flex-1"
        columns={columns}
        rows={(apiKeys ?? []).filter(
          (u) =>
            searchTerm.trim().length === 0 ||
            (u.description).toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
    </AdminPage>
  )
}

export default UsersPage
