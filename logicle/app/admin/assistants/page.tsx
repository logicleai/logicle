'use client'

import { WithLoadingAndError } from '@/components/ui'
import { mutateAssistants, useAssistants } from '@/hooks/assistants'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import { Link } from '@/components/ui/link'
import React from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, SimpleTable, column } from '@/components/ui/tables'
import { useBackends } from '@/hooks/backends'
import { delete_, post } from '@/lib/fetch'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { useRouter } from 'next/navigation'
import { Assistant, SelectableAssistantWithTools } from '@/types/dto'
import DeleteButton from '../components/DeleteButton'
import CreateButton from '../components/CreateButton'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { mutate } from 'swr'

export const dynamic = 'force-dynamic'

const Assistants = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: assistants } = useAssistants()
  const { data: backends, isLoading: isBackendLoading } = useBackends()
  const router = useRouter()

  const modalContext = useConfirmationContext()
  async function onDelete(assistant: Assistant) {
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
    const defaultBackend = backends && backends.length > 0 ? backends[0].id : ''
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
    const response = await post<SelectableAssistantWithTools>(url, newAssistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/assistants') // Let's make the chat know that there are new assistants!
    router.push(`/admin/assistants/${response.data.id}`)
  }

  /*function getBackendName(backendId: string) {
    return backends?.find((backend) => backend.id === backendId)?.name ?? '???'
  }*/

  const columns: Column<Assistant>[] = [
    column(t('table-column-name'), (assistant: Assistant) => (
      <Link variant="ghost" href={`/admin/assistants/${assistant.id}`}>
        {assistant.name.length == 0 ? '<noname>' : assistant.name}
      </Link>
    )),
    column(t('table-column-description'), (assistant: Assistant) => assistant.description),
    column(t('table-column-model'), (assistant: Assistant) => assistant.model),
    column(t('table-column-actions'), (assistant: Assistant) => (
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
    </WithLoadingAndError>
  )
}

export default Assistants
