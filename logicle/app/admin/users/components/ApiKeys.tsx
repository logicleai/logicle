import { WithLoadingAndError } from '@/components/ui'
import { useApiKeys, mutateApiKeys } from '@/hooks/apiKeys'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { AddApiKeyDialog } from './AddApiKeyDialog'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { IconTrash } from '@tabler/icons-react'
import { Action, ActionList } from '@/components/ui/actionlist'

export const ApiKeys = ({ userId }: { userId: string }) => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: apiKeys } = useApiKeys(userId)
  const [isAddApiKeyDialogVisible, setAddApiKeyDialogVisible] = useState(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  const removeApiKey = async (apiKey: dto.ApiKey) => {
    const response = await delete_(`/api/users/${userId}/apiKeys/${apiKey.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    await mutateApiKeys(userId)
    toast.success(t('apikey-deleted'))
  }

  async function onDelete(apiKey: dto.ApiKey) {
    const result = await modalContext.askConfirmation({
      title: `${t('apikey-delete-confirm')} ${apiKey.description}`,
      message: t('apikey-delete-warning'),
      confirmMsg: t('apikey-delete-confirm'),
    })
    if (!result) return

    await removeApiKey(apiKey)
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setAddApiKeyDialogVisible(true)}>{t('create-apikey')}</Button>
      </SearchBarWithButtonsOnRight>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('description')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(apiKeys ?? [])
            .filter((apiKey) => apiKey.description.toUpperCase().includes(searchTerm.toUpperCase()))
            .map((apiKey) => {
              return (
                <TableRow key={apiKey.id}>
                  <TableCell>{apiKey.description}</TableCell>
                  <TableCell>
                    <ActionList>
                      <Action
                        icon={IconTrash}
                        onClick={async () => {
                          await onDelete(apiKey)
                        }}
                        text={t('remove')}
                        destructive={true}
                      />
                    </ActionList>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      {isAddApiKeyDialogVisible && (
        <AddApiKeyDialog onClose={() => setAddApiKeyDialogVisible(false)} userId={userId} />
      )}
    </WithLoadingAndError>
  )
}
