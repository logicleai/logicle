'use client'
import { useTranslation } from 'react-i18next'
import SettingsForm from './components/SettingsForm'
import { useSWRJson } from '@/hooks/swr'
import { AdminPage } from '../components/AdminPage'

const AppSettingsPage = () => {
  const { data: settings, isLoading, error } = useSWRJson<Record<string, string>>('/api/settings')
  const { t } = useTranslation()

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('settings')}>
      {settings && (
        <>
          <SettingsForm settings={settings}></SettingsForm>
        </>
      )}
    </AdminPage>
  )
}

export default AppSettingsPage
