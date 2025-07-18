'use client'
import { useTool } from '@/hooks/tools'
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { patch } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { ScrollArea } from '@/components/ui/scroll-area'
import WithLoadingAndError from '@/components/ui/WithLoadingAndError'

const ToolPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation()
  const { isLoading, error, data: tool } = useTool(id)
  const router = useRouter()

  async function onSubmit(tool: dto.UpdateableTool) {
    const url = `/api/tools/${id}`
    const response = await patch(url, tool)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('Tool has been successfully updated'))
    router.push(`/admin/tools`)
  }

  return (
    <WithLoadingAndError isLoading={isLoading || false} error={error}>
      <div className="h-full flex flex-col">
        <div className="max-w-6xl mx-auto">
          <h1 className="flex gap-3 mb-4 px-4 py-6">
            <span>{`Tool ${tool?.name ?? ''}`}</span>
          </h1>
        </div>
        <ScrollArea>
          {tool && (
            <ToolForm
              className={'max-w-6xl mx-auto px-4 py-6'}
              tool={tool}
              type={tool.type}
              onSubmit={onSubmit}
            />
          )}
        </ScrollArea>
      </div>
    </WithLoadingAndError>
  )
}

export default ToolPage
