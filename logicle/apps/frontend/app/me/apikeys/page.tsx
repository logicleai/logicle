'use client'
import { useTranslation } from 'react-i18next'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { mutateApiKeys, useMyApiKeys } from '@/hooks/apiKeys'
import { WithLoadingAndError } from '@/components/ui'
import { CreateApiKeyDialog } from '../components/CreateApiKeyDialog'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useUserProfile } from '@/components/providers/userProfileContext'

export const UserApiKeysPage = () => {
  const { t } = useTranslation()
  const session = useUserProfile()
  const { isLoading, error, data: apiKeys } = useMyApiKeys()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const environment = useEnvironment()

  async function onDelete(apikey: dto.ApiKey) {
    const result = await modalContext.askConfirmation({
      title: `${t('delete_apikey')} ${apikey?.id}`,
      message: t('delete_apikey_confirmation'),
      confirmMsg: t('delete_apikey'),
    })
    if (!result) return

    const response = await delete_(`/api/user/apikeys/${apikey.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateApiKeys(session!.id)
    toast.success(t('apikey-deleted'))
  }

  const columns: Column<dto.ApiKey>[] = [
    column(t('table-column-name'), (apiKey) => apiKey.description),
    column(t('table-column-id'), (apiKey) => apiKey.id),
    column(t('table-column-expiration'), (apiKey) => apiKey.expiresAt ?? 'never'),
    column(t('table-column-actions'), (apiKey) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(apiKey)
          }}
          text={t('delete_apikey')}
          destructive={true}
        />
      </ActionList>
    )),
  ]
  if (!environment.enableApiKeysUi) {
    return undefined
  }
  if (isLoading || error) {
    return <WithLoadingAndError isLoading={isLoading} error={error}></WithLoadingAndError>
  }
  return (
    <AdminPage
      title={t('api_keys')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
          <Button onClick={() => setShowAddDialog(true)}>{t('create_new_api_key')}</Button>
        </SearchBarWithButtonsOnRight>
      }
    >
      <SimpleTable
        className="flex-1"
        columns={columns}
        rows={(apiKeys ?? []).filter(
          (u) =>
            searchTerm.trim().length === 0 ||
            u.description.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      {showAddDialog && (
        <CreateApiKeyDialog onClose={() => setShowAddDialog(false)}></CreateApiKeyDialog>
      )}
    </AdminPage>
  )
}

export default UserApiKeysPage
