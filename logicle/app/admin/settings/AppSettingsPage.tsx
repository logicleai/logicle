'use client'
import { useTranslation } from 'react-i18next'
import { WithLoadingAndError } from '@/components/ui'
import SettingsForm from './components/SettingsForm'
import { useSWRJson } from '@/hooks/swr'
import { AdminPageTitle } from '../components/AdminPageTitle'

const AppSettingsPage = () => {
  const { data: settings, isLoading, error } = useSWRJson<Record<string, string>>('/api/settings')
  const { t } = useTranslation('common')

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {settings && (
        <>
          <AdminPageTitle title={t('settings')} />
          <SettingsForm settings={settings}></SettingsForm>
        </>
      )}
    </WithLoadingAndError>
  )
}

export default AppSettingsPage