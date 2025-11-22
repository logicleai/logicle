'use client'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { UpdatePasswordForm } from '@/components/app/UpdatePassword'
import { useTranslation } from 'react-i18next'

export const UpdatePasswordPage = () => {
  const { t } = useTranslation()
  return (
    <AdminPage title={t('password')}>
      <UpdatePasswordForm></UpdatePasswordForm>
    </AdminPage>
  )
}
