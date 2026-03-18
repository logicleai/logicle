'use client'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { UserPreferences } from '@/components/app/UserPreferences'
import { useTranslation } from 'react-i18next'

export const UserPreferencesPage = () => {
  const { t } = useTranslation()
  return (
    <AdminPage title={t('preferences')}>
      <UserPreferences></UserPreferences>
    </AdminPage>
  )
}
