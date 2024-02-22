'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import { InsertableAssistant, SelectableAssistantWithTools } from '@/types/db'
import { patch } from '@/lib/fetch'
import { useSWRJson } from '@/hooks/swr'
import { AdminPageTitle } from '../../components/AdminPageTitle'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantPreview } from '../components/AssistantPreview'

const AssistantSettings = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const {
    data: loadedAssistant,
    error,
    isLoading,
  } = useSWRJson<SelectableAssistantWithTools>(`/api/assistants/${id}`)
  const router = useRouter()
  const [assistantState, setAssistantState] = useState<InsertableAssistant | undefined>(undefined!)

  useEffect(() => {
    loadedAssistant && setAssistantState(loadedAssistant)
  }, [loadedAssistant])

  async function onSubmit(assistant: Partial<InsertableAssistant>) {
    const url = `/api/assistants/${id}`
    const response = await patch(url, {
      ...assistant,
      id,
    })

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('assistant-successfully-updated'))
    router.push(`/admin/assistants`)
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {loadedAssistant && (
        <div className="flex flex-col h-full overflow-hidden">
          <AdminPageTitle title={`Assistant ${loadedAssistant.name}`} />
          <div className={`flex-1 min-h-0 grid grid-cols-2`}>
            <ScrollArea className="h-full flex-1 min-w-0 pr-2">
              <AssistantForm
                assistant={loadedAssistant}
                onSubmit={onSubmit}
                onChange={(values) => setAssistantState(values)}
              />
            </ScrollArea>
            <AssistantPreview
              assistant={assistantState ?? loadedAssistant}
              className="pl-2 h-full flex-1 min-w-0"
            ></AssistantPreview>
          </div>
        </div>
      )}
    </WithLoadingAndError>
  )
}

export default AssistantSettings
