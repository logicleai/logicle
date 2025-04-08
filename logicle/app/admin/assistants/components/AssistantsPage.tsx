'use client'

import { mutateAssistants } from '@/hooks/assistants'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import React, { useState } from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { SearchBarWithButtonsOnRight } from '../../../../components/app/SearchBarWithButtons'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { AssistantOwnerSelectorDialog } from './AssistantOwnerSelectorDialog'
import { useUsers } from '@/hooks/users'
import { IconEdit } from '@tabler/icons-react'
import { IconTrash } from '@tabler/icons-react'
import { Action, ActionList } from '@/components/ui/actionlist'

export const dynamic = 'force-dynamic'

export const AssistantsPage = () => {
  const listEndpoint = '/api/assistants'
  const { t } = useTranslation()
  const { isLoading, error, data: assistants } = useSWRJson<dto.AssistantWithOwner[]>(listEndpoint)
  const { data: users_ } = useUsers()
  const users = users_ || []

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
    await mutateAssistants()
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
    {
      name: t('table-column-name'),
      renderer: (assistant: dto.AssistantWithOwner) => assistant.name,
      accessorFn: (row) => row.name,
    },
    {
      name: t('table-column-owner'),
      renderer: (assistant: dto.AssistantWithOwner) => (
        <div>{users.find((user) => assistant.owner === user.id)?.name}</div>
      ),
      accessorFn: (row) => row.owner,
    },
    {
      name: t('sharing'),
      renderer: (assistant: dto.AssistantWithOwner) => (
        <div className="flex flex-col">{assistant.sharing.map((s) => dumpSharing(s))}</div>
      ),
      accessorFn: (row) => row.sharing.map((s) => dumpSharing(s)).concat(),
    },
    {
      name: t('table-column-description'),
      renderer: (assistant: dto.AssistantWithOwner) => assistant.description,
      accessorFn: (row) => row.description,
    },
    {
      name: t('table-column-model'),
      renderer: (assistant: dto.AssistantWithOwner) => assistant.modelName,
      accessorFn: (row) => row.modelName,
    },
    {
      name: t('table-column-actions'),
      renderer: (assistant: dto.AssistantWithOwner) => (
        <ActionList>
          <Action
            icon={IconEdit}
            onClick={() => {
              setAssistantSelectingOwner(assistant)
            }}
            text={t('change_owner')}
          />
          <Action
            icon={IconTrash}
            onClick={async () => {
              await onDelete(assistant)
            }}
            text={t('delete')}
            destructive={true}
          />
        </ActionList>
      ),
    },
  ]

  const searchTermUpperCase = searchTerm.toUpperCase()

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-assistants')}>
      <SearchBarWithButtonsOnRight
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      ></SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1 text-body1"
        columns={columns}
        rows={(assistants ?? []).filter((a) => {
          if (searchTerm.trim().length == 0) return 1
          return (
            a.name.toUpperCase().includes(searchTermUpperCase) ||
            a.ownerName.toUpperCase().includes(searchTermUpperCase) ||
            a.description.toUpperCase().includes(searchTermUpperCase)
          )
        })}
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
