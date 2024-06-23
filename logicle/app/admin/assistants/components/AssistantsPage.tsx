'use client'

import { mutateAssistants } from '@/hooks/assistants'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import React, { useState } from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import { useBackends } from '@/hooks/backends'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { SearchBarWithButtonsOnRight } from '../../../../components/app/SearchBarWithButtons'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { AssistantOwnerSelectorDialog } from './AssistantOwnerSelectorDialog'
import { useUsers } from '@/hooks/users'
import { IconEdit } from '@tabler/icons-react'
import { IconTrash } from '@tabler/icons-react'
import { ActionList } from '@/components/ui/actionlist'

export const dynamic = 'force-dynamic'

export const AssistantsPage = () => {
  const listEndpoint = '/api/assistants'
  const { t } = useTranslation('common')
  const { isLoading, error, data: assistants } = useSWRJson<dto.AssistantWithOwner[]>(listEndpoint)
  const { data: users_ } = useUsers()
  const users = users_ || []

  const { data: backends, isLoading: isBackendLoading } = useBackends()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [assistantSelectingOwner, setAssistantSelectingOwner] = useState<
    dto.AssistantWithOwner | undefined
  >(undefined)

  const modalContext = useConfirmationContext()
  async function onDelete(assistant: dto.AssistantWithOwner) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-assistant')} ${assistant.name}`,
      message: t('remove-assistant-confirmation'),
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

  const columns: Column<dto.AssistantWithOwner>[] = [
    column(t('table-column-name'), (assistant: dto.AssistantWithOwner) => (
      <>{assistant.name.length == 0 ? 'Unnamed assistant' : assistant.name}</>
    )),
    column(t('table-column-owner'), (assistant: dto.AssistantWithOwner) => (
      <div>{users.find((user) => assistant.owner === user.id)?.name}</div>
    )),
    column(t('table-column-sharing'), (assistant: dto.AssistantWithOwner) => (
      <div className="flex flex-vert">{assistant.sharing.map((s) => dumpSharing(s))}</div>
    )),
    column(
      t('table-column-description'),
      (assistant: dto.AssistantWithOwner) => assistant.description
    ),
    column(t('table-column-model'), (assistant: dto.AssistantWithOwner) => assistant.model),
    column(t('table-column-actions'), (assistant: dto.AssistantWithOwner) => (
      <ActionList
        actions={[
          {
            icon: IconEdit,
            onClick: () => {
              setAssistantSelectingOwner(assistant)
            },
            text: t('change_owner'),
          },
          {
            icon: IconTrash,
            onClick: () => onDelete(assistant),
            text: t('delete'),
            destructive: true,
          },
        ]}
      />
    )),
  ]

  return (
    <AdminPage isLoading={isLoading || isBackendLoading} error={error} title={t('all-assistants')}>
      <SearchBarWithButtonsOnRight
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      ></SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1 text-body1"
        columns={columns}
        rows={(assistants ?? []).filter(
          (a) =>
            searchTerm.trim().length == 0 || a.name.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
      {assistantSelectingOwner && (
        <AssistantOwnerSelectorDialog
          assistant={assistantSelectingOwner}
          onClose={() => setAssistantSelectingOwner(undefined)}
        ></AssistantOwnerSelectorDialog>
      )}
    </AdminPage>
  )
}
