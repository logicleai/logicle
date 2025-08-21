'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import BackendForm, { BackendFormFields } from '../components/BackendForm'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { post } from '@/lib/fetch'
import { ProviderType } from '@/types/provider'
import { ProviderDefaultFactory } from '@/types/providerFactory'
import { AdminPage } from '../../components/AdminPage'
import * as dto from '@/types/dto'

const CreateBackendPage = () => {
  const { t } = useTranslation()
  const router = useRouter()

  const searchParams = useSearchParams()
  const providerType = (searchParams.get('providerType') ?? 'GenericOpenAIServer') as ProviderType
  const defaultBackend: dto.InsertableBackend = ProviderDefaultFactory.create(providerType)

  async function onSubmit(values: Partial<BackendFormFields>) {
    const url = `/api/backends`
    const response = await post(url, { ...defaultBackend, ...values })

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('backend-successfully-created'))
    router.push(`/admin/backends`)
  }
  const flattened = defaultBackend as unknown as BackendFormFields
  return (
    <AdminPage title={t('create-backend')}>
      <BackendForm backend={flattened} onSubmit={onSubmit} creating={true} />
    </AdminPage>
  )
}

export default CreateBackendPage
