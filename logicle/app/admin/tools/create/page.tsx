'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useState } from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { ScrollableAdminPage } from '../../components/AdminPage'
import { ToolType } from '@/lib/tools/tools'
import { OpenApiInterface } from '@/lib/tools/openapi/interface'
import { ToolSharingDialog } from '../components/ToolSharingDialog'
import { Button } from '@/components/ui/button'

const CreateToolPage = () => {
  const { t } = useTranslation()
  const router = useRouter()

  const searchParams = useSearchParams()
  const type = (searchParams.get('type') ?? OpenApiInterface.toolName) as ToolType
  const [sharing, setSharing] = useState<dto.Sharing2>({ type: 'public' })
  const [sharingDialogVisible, setSharingDialogVisible] = useState<boolean>(false)

  const defaultTool: dto.InsertableTool = {
    type,
    name: '',
    description: '',
    tags: [],
    icon: null,
    configuration: {},
    promptFragment: '',
    sharing: {
      type: 'public',
    },
  }

  async function onSubmit(values: dto.UpdateableTool) {
    const url = `/api/tools`
    const response = await post(url, { ...defaultTool, ...values, sharing })

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('tool-successfully-created'))
    router.push(`/admin/tools`)
  }

  return (
    <ScrollableAdminPage
      headerActions={<Button onClick={() => setSharingDialogVisible(true)}>{t('sharing')}</Button>}
      title={t('create_tool')}
    >
      <ToolForm tool={defaultTool} type={type} onSubmit={onSubmit} />
      {sharingDialogVisible && (
        <ToolSharingDialog
          onClose={() => {
            setSharingDialogVisible(false)
          }}
          sharing={sharing}
          setSharing={setSharing}
        ></ToolSharingDialog>
      )}
    </ScrollableAdminPage>
  )
}

export default CreateToolPage
