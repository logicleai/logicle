'use client'

import { mutateAssistants } from '@/hooks/assistants'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import React, { useState } from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import { useBackends } from '@/hooks/backends'
import { delete_, post } from '@/lib/fetch'
import { useRouter } from 'next/navigation'
import * as dto from '@/types/dto'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { mutate } from 'swr'
import { useSWRJson } from '@/hooks/swr'
import { AssistantOwnerSelector } from '../../../../components/app/AssistantOwnerSelector'
import { Button } from '../../../../components/ui/button'
import { SearchBarWithButtonsOnRight } from '../../../../components/app/SearchBarWithButtons'
import { AdminPage } from '@/app/admin/components/AdminPage'

export const dynamic = 'force-dynamic'

export const AssistantsPage = () => {
  const listEndpoint = '/api/assistants'
  const { t } = useTranslation('common')
  const {
    isLoading,
    error,
    data: assistants,
  } = useSWRJson<dto.SelectableAssistantWithOwner[]>(listEndpoint)

  const { data: backends, isLoading: isBackendLoading } = useBackends()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const defaultBackend = backends && backends.length > 0 ? backends[0].id : undefined

  const modalContext = useConfirmationContext()
  async function onDelete(assistant: dto.Assistant) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-assistant')} ${assistant.name}`,
      message: <p>{t('remove-assistant-confirmation')}</p>,
      confirmMsg: t('remove-assistant'),
    })
    if (!result) return

    const response = await delete_(`/api/assistants/${assistant.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateAssistants()
    toast.success(t('assistant-deleted'))
  }

  const dumpSharing = (sharing: dto.Sharing) => {
    if (sharing.type == 'workspace') {
      return sharing.workspaceName
    } else {
      return sharing.type
    }
  }

  const columns: Column<dto.SelectableAssistantWithOwner>[] = [
    column(t('table-column-name'), (assistant: dto.SelectableAssistantWithOwner) => (
      <>{assistant.name.length == 0 ? '<noname>' : assistant.name}</>
    )),
    column(t('table-column-owner'), (assistant: dto.SelectableAssistantWithOwner) => (
      <AssistantOwnerSelector assistant={assistant} />
    )),
    column(t('table-column-sharing'), (assistant: dto.SelectableAssistantWithOwner) => (
      <div className="flex flex-vert">{assistant.sharing.map((s) => dumpSharing(s))}</div>
    )),
    column(
      t('table-column-description'),
      (assistant: dto.SelectableAssistantWithOwner) => assistant.description
    ),
    column(
      t('table-column-model'),
      (assistant: dto.SelectableAssistantWithOwner) => assistant.model
    ),
  ]

  return (
    <AdminPage isLoading={isLoading || isBackendLoading} error={error} title={t('all-assistants')}>
      {backends?.length != 0 ? (
        <>
          <SearchBarWithButtonsOnRight
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          ></SearchBarWithButtonsOnRight>
          <ScrollableTable
            className="flex-1 text-body1"
            columns={columns}
            rows={(assistants ?? []).filter(
              (a) =>
                searchTerm.trim().length == 0 ||
                a.name.toUpperCase().includes(searchTerm.toUpperCase())
            )}
            keygen={(t) => t.id}
          />
        </>
      ) : (
        <div>{t('cant_create_assistant_if_no_backend')}</div>
      )}
    </AdminPage>
  )
}
