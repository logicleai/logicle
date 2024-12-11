import { UserPreferences } from '@/components/app/UserPreferences'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'UserPreferences',
}

const PreferencesPage = async () => {
  return <UserPreferences />
}

export default PreferencesPage
