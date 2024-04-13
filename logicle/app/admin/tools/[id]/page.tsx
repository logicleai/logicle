'use client'
import { useTool } from '@/hooks/tools'
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { patch } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { AdminPage } from '../../components/AdminPage'

const ToolPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const { isLoading, error, data: tool } = useTool(id)
  const router = useRouter()

  async function onSubmit(tool: dto.UpdateableToolDTO) {
    const url = `/api/tools/${id}`
    const response = await patch(url, tool)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('Tool has been successfully updated'))
    router.push(`/admin/tools`)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={`Tool ${tool?.name ?? ''}`}>
      {tool && <ToolForm tool={tool} type={tool.type} onSubmit={onSubmit} />}
    </AdminPage>
  )
}

export default ToolPage
