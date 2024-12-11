'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { ChatGptRetrievalPluginInterface } from '@/lib/tools/chatgpt-retrieval-plugin/interface'
import { AdminPage } from '../../components/AdminPage'
import { ToolType } from '@/lib/tools/tools'

const CreateToolPage = () => {
  const { t } = useTranslation()
  const router = useRouter()

  const searchParams = useSearchParams()
  const type = (searchParams.get('type') ?? ChatGptRetrievalPluginInterface.toolName) as ToolType

  const defaultTool: dto.InsertableToolDTO = {
    type,
    name: '',
    configuration: {},
  }

  async function onSubmit(values: dto.UpdateableToolDTO) {
    const url = `/api/tools`
    const response = await post(url, { ...defaultTool, ...values })

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('tool-successfully-created'))
    router.push(`/admin/tools`)
  }

  return (
    <AdminPage title={t('create_tool')}>
      <ToolForm tool={defaultTool} type={type} onSubmit={onSubmit} />
    </AdminPage>
  )
}

export default CreateToolPage
