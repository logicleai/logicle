'use client'
import { useBackend } from '@/hooks/backends'
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import BackendForm, { BackendFormFields } from '../components/BackendForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { patch } from '@/lib/fetch'
import { ScrollableAdminPage } from '../../components/AdminPage'

const BackendPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation()
  const { isLoading, error, data: backend } = useBackend(id)
  const router = useRouter()

  async function onSubmit(values: Partial<BackendFormFields>) {
    const url = `/api/backends/${id}`
    const response = await patch(url, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('backend-successfully-updated'))
    router.push(`/admin/backends`)
  }

  return (
    <ScrollableAdminPage isLoading={isLoading} error={error} title={`Backend ${backend?.name}`}>
      {backend && (
        <BackendForm backend={backend as unknown as BackendFormFields} onSubmit={onSubmit} />
      )}
    </ScrollableAdminPage>
  )
}

export default BackendPage
