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
import { AdminPage } from '../../components/AdminPage'
import { ScrollArea } from '@/components/ui/scroll-area'

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
    <AdminPage isLoading={isLoading} error={error} title={`Tool ${tool?.name ?? ''}`}>
      <ScrollArea>
        {tool && <ToolForm tool={tool} type={tool.type} onSubmit={onSubmit} />}
      </ScrollArea>
    </AdminPage>
  )
}

export default ToolPage
