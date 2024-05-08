'use client'

import ProfileLayout from '@/app/layouts/ProfileLayout'
import { NavEntry } from '../../components/ui/settings-navbar'
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

export default function ProfilePageLayout({ children }) {
  const { t } = useTranslation('common')
  return (
    <ProfileLayout title={t('my-profile')} navEntries={navItems}>
      {children}
    </ProfileLayout>
  )
}
