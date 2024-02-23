'use client'
import SettingsLayout from '@/app/layouts/SettingsLayout'
import { NavEntry } from '@/components/ui/navbar'
import { ENABLE_ADVANCED_TOOLS } from '@/lib/const'
import { useTranslation } from 'react-i18next'

const navEntries: NavEntry[] = [
  /*{
    title: 'dashboard',
    href: '/admin/analytics',
  },*/
  {
    title: 'assistants',
    href: '/admin/assistants',
  },
  {
    title: 'users',
    href: '/admin/users',
  },
  /*  {
    title: "workspaces",
    href: "/admin/workspaces",
  },*/
  {
    title: 'backends',
    href: '/admin/backends',
  },
  ENABLE_ADVANCED_TOOLS
    ? {
        title: 'tools',
        href: '/admin/tools',
      }
    : undefined,
  {
    title: 'SSO',
    href: '/admin/sso',
  },
  {
    title: 'settings',
    href: '/admin/settings',
  },
].filter(Boolean) as NavEntry[]

export default function AdminLayout({ children }) {
  const { t } = useTranslation('common')
  return (
    <SettingsLayout title={t('administrator-settings')} navEntries={navEntries}>
      {children}
    </SettingsLayout>
  )
}
