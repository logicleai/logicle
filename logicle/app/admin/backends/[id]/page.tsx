'use client'
import { useBackend } from '@/hooks/backends'
import { useParams, useRouter } from 'next/navigation'
import React from 'react'
import BackendForm, { BackendFormFields } from '../components/BackendForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { patch } from '@/lib/fetch'
import { AdminPage } from '../../components/AdminPage'

const BackendPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const { isLoading, error, data: backend } = useBackend(id)
  const router = useRouter()

  async function onSubmit(backend: Partial<BackendFormFields>) {
    const url = `/api/backends/${id}`
    const response = await patch(url, backend)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('backend-successfully-updated'))
    router.push(`/admin/backends`)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={`Backend ${backend?.name}`}>
      {backend && (
        <>
          <BackendForm backend={backend} onSubmit={onSubmit} />
        </>
      )}
    </AdminPage>
  )
}

export default BackendPage
