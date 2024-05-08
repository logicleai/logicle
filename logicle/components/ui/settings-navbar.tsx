'use client'
import { useTranslation } from 'next-i18next'
import { Link } from '@/components/ui/link'
import { usePathname } from 'next/navigation'
import { TablerIconsProps } from '@tabler/icons-react'
import { useEnvironment } from '../../app/context/environmentProvider'
import { IconSettings2, IconUsers, IconWebhook } from '@tabler/icons-react'

export interface NavEntry {
  title: string
  icon?: (props: TablerIconsProps) => JSX.Element
  href: string
}

interface Props {
  className: string
  entries: NavEntry[]
}

export function SettingsNavbar({ className, entries }: Props) {
  const { t } = useTranslation('common')
  const pathname = usePathname()
  const filteredEntries = entries.filter((entry) => pathname.startsWith(entry.href))
  const environment = useEnvironment()
  const match =
    filteredEntries.length == 0
      ? { href: undefined }
      : filteredEntries.reduce((a, b) => {
          return a.href.length > b.href.length ? a : b
        })
  return (
    <nav className={className}>
      <ul className="flex flex-col text-h3">
        <li key={`li-/admin/assistants`}>
          <Link
            className={`w-full px-2 py-3 ${
              '/admin/assistants' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
            }`}
            variant={'/admin/assistants' == match.href ? 'sidebar_active' : 'ghost'}
            href='/admin/assistants'
          >
            {t('assistants')}
          </Link>
        </li>
        <li key={`li-/admin/users`}>
          <Link
            className={`w-full px-2 py-3 ${
              '/admin/users' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
            }`}
            icon={IconUsers}
            variant={'/admin/users' == match.href ? 'sidebar_active' : 'ghost'}
            href='/admin/users'
          >
            {t('users')}
          </Link>
        </li>
        {environment.enableWorkspaces && (
          <li key={`li-/admin/workspaces`}>
            <Link
              className={`w-full px-2 py-3 ${
                '/admin/workspaces' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
              }`}
              variant={'/admin/workspaces' == match.href ? 'sidebar_active' : 'ghost'}
              href='/admin/workspaces'
            >
              {t('workspaces')}
            </Link>
          </li>
        )}
        <li key={`li-/admin/backends`}>
          <Link
            className={`w-full px-2 py-3 ${
              '/admin/backends' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
            }`}
            icon={IconWebhook}
            variant={'/admin/backends' == match.href ? 'sidebar_active' : 'ghost'}
            href='/admin/backends'
          >
            {t('backends')}
          </Link>
        </li>
        {environment.enableTools && (
          <li key={`li-/admin/tools`}>
            <Link
              className={`w-full px-2 py-3 ${
                '/admin/tools' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
              }`}
              variant={'/admin/tools' == match.href ? 'sidebar_active' : 'ghost'}
              href='/admin/tools'
            >
              {t('tools')}
            </Link>
          </li>
        )}
        <li key={`li-/admin/sso`}>
          <Link
            className={`w-full px-2 py-3 ${
              '/admin/sso' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
            }`}
            variant={'/admin/sso' == match.href ? 'sidebar_active' : 'ghost'}
            href='/admin/sso'
          >
            {t('SSO')}
          </Link>
        </li>
        <li key={`li-/admin/settings`}>
          <Link
            className={`w-full px-2 py-3 ${
              '/admin/settings' == match.href ? '' : 'hover:bg-secondary_color_hover/50'
            }`}
            icon={IconSettings2}
            variant={'/admin/settings' == match.href ? 'sidebar_active' : 'ghost'}
            href='/admin/settings'
          >
            {t('settings')}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

export default SettingsNavbar