'use client'

import SettingsLayout from '@/app/layouts/SettingsLayout'
import { NavEntry } from '../../components/ui/navbar'
import { useTranslation } from 'react-i18next'

const navItems: NavEntry[] = [
  {
    title: 'profile',
    href: '/profile',
  },
  {
    title: 'Change password',
    href: '/profile/password',
  },
]

export default function ProfileLayout({ children }) {
  const { t } = useTranslation('common')
  return (
    <SettingsLayout title={t('my-profile')} navEntries={navItems}>
      {children}
    </SettingsLayout>
  )
}
