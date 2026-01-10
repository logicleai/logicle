'use client'
import { useTranslation } from 'react-i18next'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { mutateMySessions, useMySessions } from '@/hooks/sessions'
import { WithLoadingAndError } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import * as dto from '@/types/dto'

const authLabel = (t: (key: string) => string, method: dto.SessionSummary['authMethod']) => {
  if (method === 'idp') {
    return t('single-sign-on')
  }
  return t('password')
}

export const UserSessionsPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: sessions } = useMySessions()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  async function onDelete(sessionItem: dto.SessionSummary) {
    const result = await modalContext.askConfirmation({
      title: `${t('delete_session')} ${sessionItem.id}`,
      message: t('delete_session_confirmation'),
      confirmMsg: t('delete_session'),
    })
    if (!result) return

    const response = await delete_(`/api/auth/sessions/${sessionItem.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateMySessions()
    toast.success(t('session-deleted'))
  }

  const columns: Column<dto.SessionSummary>[] = [
    column(t('table-column-id'), (sessionItem) => sessionItem.id),
    column(t('table-column-created-at'), (sessionItem) => sessionItem.createdAt),
    column(t('table-column-expiration'), (sessionItem) => sessionItem.expiresAt),
    column(t('table-column-type'), (sessionItem) => authLabel(t, sessionItem.authMethod)),
    column(t('table-column-current'), (sessionItem) =>
      sessionItem.isCurrent ? <Badge variant="secondary">{t('active')}</Badge> : ''
    ),
    column(t('table-column-actions'), (sessionItem) =>
      sessionItem.isCurrent ? null : (
        <ActionList>
          <Action
            icon={IconTrash}
            onClick={async () => {
              await onDelete(sessionItem)
            }}
            text={t('delete_session')}
            destructive={true}
          />
        </ActionList>
      )
    ),
  ]

  if (isLoading || error) {
    return <WithLoadingAndError isLoading={isLoading} error={error}></WithLoadingAndError>
  }

  const normalizedSearch = searchTerm.trim().toUpperCase()
  const filteredSessions =
    normalizedSearch.length === 0
      ? sessions ?? []
      : (sessions ?? []).filter((sessionItem) => {
          return (
            sessionItem.id.toUpperCase().includes(normalizedSearch) ||
            sessionItem.authMethod.toUpperCase().includes(normalizedSearch)
          )
        })

  return (
    <AdminPage
      title={t('sessions')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
      }
    >
      <SimpleTable
        className="flex-1"
        columns={columns}
        rows={filteredSessions}
        keygen={(sessionItem) => sessionItem.id}
      />
    </AdminPage>
  )
}

export default UserSessionsPage
