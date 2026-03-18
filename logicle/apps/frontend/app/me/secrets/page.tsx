'use client'
import { useTranslation } from 'react-i18next'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { UserApiKeysPanel } from '@/components/app/UserApiKeysPanel'

const UserSecretsPage = () => {
  const { t } = useTranslation()
  return (
    <AdminPage title={t('secrets')}>
      <UserApiKeysPanel />
    </AdminPage>
  )
}

export default UserSecretsPage
