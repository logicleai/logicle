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
import DeleteButton from '../../admin/components/DeleteButton'
import CreateButton from '../../admin/components/CreateButton'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { mutate } from 'swr'
import { useSWRJson } from '@/hooks/swr'
import { UserAssistant } from '@/types/chat'

export const dynamic = 'force-dynamic'

const UserAssistants = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: assistants } = useSWRJson<UserAssistant[]>(`/api/user/assistants`)
  const { data: backends, isLoading: isBackendLoading } = useBackends()
  const router = useRouter()
  const defaultBackend = backends && backends.length > 0 ? backends[0].id : undefined

  const modalContext = useConfirmationContext()
  async function onDelete(assistant: UserAssistant) {
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
    mutate('/api/user/assistants') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  const columns: Column<UserAssistant>[] = [
    column(t('table-column-name'), (assistant: UserAssistant) => (
      <Link variant="ghost" href={`/assistants/${assistant.id}`}>
        {assistant.name.length == 0 ? '<noname>' : assistant.name}
      </Link>
    )),
    column(t('table-column-owner'), (assistant: UserAssistant) => ''),
    column(t('table-column-description'), (assistant: UserAssistant) => assistant.description),
    column(t('table-column-model'), (assistant: UserAssistant) => 'model'),
    column(t('table-column-actions'), (assistant: UserAssistant) => (
      <DeleteButton
        onClick={() => {
          onDelete(assistant)
        }}
      >
        {t('remove-assistant')}
      </DeleteButton>
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

export default UserAssistants