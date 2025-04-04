'use client'
import SettingsLayout from '@/app/layouts/SettingsLayout'
import { NavEntry } from '@/components/ui/navbar'
import { useTranslation } from 'react-i18next'
import { Environment, useEnvironment } from '../context/environmentProvider'

const navEntries = (env: Environment) => {
  const entries: NavEntry[] = []
  entries.push({
    title: 'analytics',
    href: '/admin/analytics',
  })
  entries.push({
    title: 'assistants',
    href: '/admin/assistants',
  })
  entries.push({
    title: 'users',
    href: '/admin/users',
  })
  if (env.enableWorkspaces) {
    entries.push({
      title: 'workspaces',
      href: '/admin/workspaces',
    })
  }
  if (!env.backendConfigLock) {
    entries.push({
      title: 'backends',
      href: '/admin/backends',
    })
  }

  entries.push({
    title: 'tools',
    href: '/admin/tools',
  })

  entries.push({
    title: 'SSO',
    href: '/admin/sso',
  })
  entries.push({
    title: 'settings',
    href: '/admin/settings',
  })
  return entries
}

export default function AdminLayout({ children }) {
  const { t } = useTranslation()
  const environment = useEnvironment()
  return (
    <SettingsLayout title={t('administrator-settings')} navEntries={navEntries(environment)}>
      {children}
    </SettingsLayout>
  )
}
