'use client'
import Navbar, { NavEntry } from '@/components/ui/navbar'
import { useTranslation } from 'react-i18next'
import { MainLayout } from '../layouts/MainLayout'
import { Environment, useEnvironment } from '../context/environmentProvider'

const navEntries = (environment: Environment) => {
  const entries: NavEntry[] = []
  entries.push({
    title: 'profile',
    href: '/me/profile',
  })
  entries.push({
    title: 'preferences',
    href: '/me/preferences',
  })
  entries.push({
    title: 'password',
    href: '/me/password',
  })
  entries.push({
    title: 'parameters',
    href: '/me/parameters',
  })
  entries.push({
    title: 'sessions',
    href: '/me/sessions',
  })
  if (environment.enableApiKeysUi) {
    entries.push({
      title: 'api_keys',
      href: '/me/apikeys',
    })
    entries.push({
      title: 'secrets',
      href: '/me/secrets',
    })
  }
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
