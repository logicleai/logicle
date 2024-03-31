import AppSettingsPage from './AppSettingsPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
};

export default async function AppSettings() {
  return <AppSettingsPage />
}