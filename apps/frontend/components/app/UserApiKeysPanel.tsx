'use client'

import { useTranslation } from 'react-i18next'
import { useUserSecretStatuses } from '@/hooks/userSecrets'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import * as dto from '@/types/dto'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Menu, MenuItem } from '@/components/ui/menu'
import { IconDotsVertical, IconTrash } from '@tabler/icons-react'
import { deleteUserSecret } from '@/services/userSecrets'
import toast from 'react-hot-toast'
import { useSWRConfig } from 'swr'
import { useConfirmationContext } from '@/components/providers/confirmationContext'

export const UserApiKeysPanel = () => {
  const { t } = useTranslation()
  const { data: statuses } = useUserSecretStatuses()
  const { mutate } = useSWRConfig()
  const modalContext = useConfirmationContext()

  if (!statuses) {
    return null
  }

  const rows = [...statuses].sort((a, b) => a.label.localeCompare(b.label))
  const handleDelete = async (status: dto.UserSecretStatus) => {
    const confirmed = await modalContext.askConfirmation({
      title: t('remove_secret_title'),
      message: t('remove_secret_confirmation', { label: status.label }),
      confirmMsg: t('remove'),
    })
    if (!confirmed) {
      return
    }
    const response = await deleteUserSecret(status.id)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate('/api/user/secrets')
    toast.success(t('secret_removed'))
  }

  const columns: Column<dto.UserSecretStatus>[] = [
    column(t('label'), (status) => status.label),
    column(t('type'), (status) => status.type),
    column(t('status'), (status) =>
      status.readable ? t('secret_configured') : t('secret_unreadable')
    ),
    column(t('action'), (status) => (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('action')}>
            <IconDotsVertical size={18} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Menu>
            <MenuItem icon={IconTrash} onClick={() => handleDelete(status)} className="text-alert">
              {t('remove')}
            </MenuItem>
          </Menu>
        </PopoverContent>
      </Popover>
    )),
  ]

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">{t('no_user_secrets')}</div>
  }

  return <SimpleTable columns={columns} rows={rows} keygen={(row) => row.context} />
}
