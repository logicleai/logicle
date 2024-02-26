'use client'
import React from 'react'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import { InsertableAssistant } from '@/types/db'
import { post } from '@/lib/fetch'
import { useBackends } from '@/hooks/backends'
import { AdminPageTitle } from '../../components/AdminPageTitle'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { ScrollArea } from '@/components/ui/scroll-area'

export const dynamic = 'force-dynamic'

const AssistantSettings = () => {
  const { t } = useTranslation('common')
  const router = useRouter()
  const { data: backends } = useBackends()

  async function onSubmit(assistant: InsertableAssistant) {
    const url = `/api/assistants`
    const response = await post(url, assistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/assistants') // Let's make the chat know that there are new assistants!
    toast.success(t('assistant-successfully-created'))
    router.push(`/admin/assistants`)
  }

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

  return (
    <div className="w-full h-full flex flex-col">
      <AdminPageTitle title="Create assistant" />
      <ScrollArea>
        <AssistantForm assistant={newAssistant} onSubmit={onSubmit} />
      </ScrollArea>
    </div>
  )
}

export default AssistantSettings
