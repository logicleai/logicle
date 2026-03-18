import { Metadata } from 'next'
import { UserPreferencesPage } from '../components/UserPreferencesPage'

export const metadata: Metadata = {
  title: 'Preferences',
}

export default async function UserPreferences() {
  return <UserPreferencesPage />
}
