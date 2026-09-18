'use client'
import Navbar, { NavEntry } from '@/components/ui/navbar'
import { useTranslation } from 'react-i18next'
import { Environment, useEnvironment } from '../context/environmentProvider'
import { MainLayout } from '../layouts/MainLayout'
import {
  IconChartBar,
  IconCode,
  IconDatabase,
  IconId,
  IconRobot,
  IconSettings,
  IconTool,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react'
const navEntries = (env: Environment) => {
  const entries: NavEntry[] = []
  entries.push({
    title: 'analytics',
    href: '/admin/analytics',
    icon: IconChartBar,
  })
  entries.push({
    title: 'assistants',
    href: '/admin/assistants',
    icon: IconRobot,
  })
  entries.push({
    title: 'users',
    href: '/admin/users',
    icon: IconUsers,
  })
  entries.push({
    title: 'workspaces',
    href: '/admin/workspaces',
    icon: IconWorld,
  })
  if (!env.backendConfigLock) {
    entries.push({
      title: 'backends',
      href: '/admin/backends',
      icon: IconDatabase,
    })
  }

  entries.push({
    title: 'tools',
    href: '/admin/tools',
    icon: IconTool,
  })

  entries.push({
    title: 'satellites',
    href: '/admin/satellites',
    icon: IconCode,
  })

  entries.push({
    title: 'SSO',
    href: '/admin/sso',
    icon: IconId,
  })
  entries.push({
    title: 'settings',
    href: '/admin/settings',
    icon: IconSettings,
  })
  return entries
}

const Sidebar = ({ title, navEntries }: { title: string; navEntries: NavEntry[] }) => {
  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-7">
      <h2 className="px-2 text-lg font-bold">{title}</h2>
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
