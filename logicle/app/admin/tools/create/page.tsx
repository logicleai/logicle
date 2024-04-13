'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { ChatGptRetrievalPluginInterface } from '@/lib/tools/chatgpt-retrieval-plugin/interface'
import { AdminPage } from '../../components/AdminPage'

const CreateToolPage = () => {
  const { t } = useTranslation('common')
  const router = useRouter()

  const searchParams = useSearchParams()
  const type = searchParams.get('type') ?? ChatGptRetrievalPluginInterface.toolName

  // Use the ProviderDefaultFactory to create the default tool
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
    mutate(url)
    toast.success(t('tool-successfully-created'))
    router.push(`/admin/tools`)
  }

  return (
    <AdminPage title={t('create-tool')}>
      <ToolForm tool={defaultTool} type={type} onSubmit={onSubmit} />
    </AdminPage>
  )
}

export default CreateToolPage
