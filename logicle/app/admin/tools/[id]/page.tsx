'use client'
import { useTool } from '@/hooks/tools'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import ToolForm from '../components/ToolForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { patch } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { AdminPage } from '../../components/AdminPage'
import { Button } from '@/components/ui/button'
import { ToolSharingDialog } from '../components/ToolSharingDialog'

const ToolPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation()
  const { isLoading, error, data: tool } = useTool(id)
  const [sharing, setSharing] = useState<dto.Sharing2>({ type: 'private' })
  const router = useRouter()
  const [sharingDialogVisible, setSharingDialogVisible] = useState<boolean>(false)

  useEffect(() => {
    if (tool) {
      setSharing(tool.sharing)
    }
  }, [tool])

  async function onSubmit(tool: dto.UpdateableTool) {
    const url = `/api/tools/${id}`
    const response = await patch(url, {
      ...tool,
      sharing,
    })

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('Tool has been successfully updated'))
    router.push(`/admin/tools`)
  }

  return (
    <AdminPage
      headerActions={<Button onClick={() => setSharingDialogVisible(true)}>{t('sharing')}</Button>}
      isLoading={isLoading}
      error={error}
      title={`Tool ${tool?.name ?? ''}`}
    >
      {tool && <ToolForm tool={tool} type={tool.type} onSubmit={onSubmit} />}
      {tool && sharingDialogVisible && (
        <ToolSharingDialog
          onClose={() => {
            setSharingDialogVisible(false)
          }}
          sharing={sharing}
          setSharing={setSharing}
        ></ToolSharingDialog>
      )}
    </AdminPage>
  )
}

export default ToolPage
