'use client'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { UpdateAccountPanel } from '@/components/app/UserDialog'
import { useTranslation } from 'react-i18next'

export const ProfilePage = () => {
  const { t } = useTranslation()
  return (
    <AdminPage title={t('profile')}>
      <UpdateAccountPanel></UpdateAccountPanel>
    </AdminPage>
  )
}
