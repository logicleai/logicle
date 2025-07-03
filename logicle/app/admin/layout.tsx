'use client'
import Navbar, { NavEntry } from '@/components/ui/navbar'
import { useTranslation } from 'react-i18next'
import { Environment, useEnvironment } from '../context/environmentProvider'
import { MainLayout } from '../layouts/MainLayout'

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
  entries.push({
    title: 'workspaces',
    href: '/admin/workspaces',
  })
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

const Sidebar = ({ title, navEntries }: { title: string; navEntries: NavEntry[] }) => {
  return (
    <div className="flex flex-col px-3 py-6 gap-3 flex-1">
      <h2>{title}</h2>
      <Navbar entries={navEntries} className="flex-1" />
    </div>
  )
}

export default function AdminLayout({ children }) {
  const { t } = useTranslation()
  const environment = useEnvironment()
  return (
    <MainLayout
      leftBar={<Sidebar title={t('administrator-settings')} navEntries={navEntries(environment)} />}
      leftBarCollapsible={false}
    >
      <div className="flex-1 h-full bg-background overflow-hidden">{children}</div>
    </MainLayout>
  )
}
