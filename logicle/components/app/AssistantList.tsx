'use client'

import { WithLoadingAndError } from '@/components/ui'
import { mutateAssistants } from '@/hooks/assistants'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import { Link } from '@/components/ui/link'
import React from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import { useBackends } from '@/hooks/backends'
import { delete_, post } from '@/lib/fetch'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { useRouter } from 'next/navigation'
import * as dto from '@/types/dto'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { mutate } from 'swr'
import DeleteButton from '@/app/admin/components/DeleteButton'
import CreateButton from '@/app/admin/components/CreateButton'
import { useSWRJson } from '@/hooks/swr'
import { AssistantOwnerSelector } from './AssistantOwnerSelector'

export const dynamic = 'force-dynamic'

interface Params {
  scope: 'user' | 'admin'
}

export const AssistantList = ({ scope }: Params) => {
  const listEndpoint = `${scope == 'user' ? '/api/user/assistants' : '/api/assistants'}`
  const { t } = useTranslation('common')
  const {
    isLoading,
    error,
    data: assistants,
  } = useSWRJson<dto.SelectableAssistantWithOwner[]>(listEndpoint)

  const { data: backends, isLoading: isBackendLoading } = useBackends()
  const router = useRouter()
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

  const onCreate = async () => {
    const newAssistant = {
      icon: null,
      description: '',
      name: '',
      backendId: defaultBackend,
      model: '',
      systemPrompt: '',
      tokenLimit: 4000,
      temperature: DEFAULT_TEMPERATURE,
      tools: [], // TODO: load available tools from backend
      files: [],
    }
    const url = `/api/assistants`
    const response = await post<dto.SelectableAssistantWithOwner>(url, newAssistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
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
      <>
        {scope == 'user' ? (
          <Link variant="ghost" href={`/assistants/${assistant.id}`}>
            {assistant.name.length == 0 ? '<noname>' : assistant.name}
          </Link>
        ) : (
          <>{assistant.name.length == 0 ? '<noname>' : assistant.name}</>
        )}
      </>
    )),
    column(t('table-column-owner'), (assistant: dto.SelectableAssistantWithOwner) => {
      return scope == 'admin' ? (
        <AssistantOwnerSelector assistant={assistant} />
      ) : (
        <>{assistant.ownerName || ''}</>
      )
    }),
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
    column(t('table-column-actions'), (assistant: dto.SelectableAssistantWithOwner) => (
      <>
        {scope == 'user' && (
          <DeleteButton
            onClick={() => {
              onDelete(assistant)
            }}
          >
            {t('remove-assistant')}
          </DeleteButton>
        )}
      </>
    )),
  ]

  return (
    <WithLoadingAndError isLoading={isLoading || isBackendLoading} error={error}>
      {backends?.length != 0 ? (
        <div className="h-full flex flex-col">
          <AdminPageTitle title={t('all-assistants')}>
            <CreateButton onClick={onCreate} />
          </AdminPageTitle>
          <ScrollableTable
            className="flex-1 text-body1"
            columns={columns}
            rows={assistants ?? []}
            keygen={(t) => t.id}
          />
        </div>
      ) : (
        <div className="h-full">
          <AdminPageTitle title={t('all-assistants')}></AdminPageTitle>
          {t('cant_create_assistant_if_no_backend')}
        </div>
      )}
    </WithLoadingAndError>
  )
}
