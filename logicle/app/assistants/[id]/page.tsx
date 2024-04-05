'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { patch, put } from '@/lib/fetch'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantPreview } from '../components/AssistantPreview'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { Button } from '@/components/ui/button'

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const url = `/api/assistants/${id}`
  const {
    data: loadedAssistant,
    error,
    isLoading,
  } = useSWRJson<dto.SelectableAssistantWithTools>(`/api/assistants/${id}`)
  const [assistantState, setAssistantState] = useState<
    dto.SelectableAssistantWithTools | undefined
  >(undefined!)

  useEffect(() => {
    loadedAssistant && setAssistantState(loadedAssistant)
  }, [loadedAssistant])

  async function onSubmit(assistant: Partial<dto.InsertableAssistant>) {
    const response = await patch(url, assistant)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('assistant-successfully-updated'))
  }
  const shareNone = async () => {
    const response = await put(`${url}/sharing`, {
      type: 'none',
    })
  }
  const shareAll = async () => {
    const response = await put(`${url}/sharing`, {
      type: 'all',
    })
  }

  const shareWorkspace = async (workspace: string) => {
    const response = await put(`${url}/sharing`, {
      type: 'workspace',
      workspace: workspace,
    })
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {loadedAssistant && (
        <div className="flex flex-col h-full overflow-hidden">
          <AdminPageTitle title={`Assistant ${loadedAssistant.name}`}>
            <Button onClick={shareNone}>shareNone</Button>
            <Button onClick={shareAll}>shareAll</Button>
            <Button onClick={() => shareWorkspace('whatever')}>shareWorkspace</Button>
          </AdminPageTitle>
          <div className={`flex-1 min-h-0 grid grid-cols-2`}>
            <ScrollArea className="h-full flex-1 min-w-0 pr-2">
              <AssistantForm
                assistant={loadedAssistant}
                onSubmit={onSubmit}
                onChange={(values) => setAssistantState({ ...loadedAssistant, ...values })}
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

export default AssistantPage
