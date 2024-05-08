'use client'
import { useTranslation } from 'next-i18next'
import { Link } from '@/components/ui/link'
import { usePathname } from 'next/navigation'
import { TablerIconsProps } from '@tabler/icons-react'

export interface NavEntry {
  title: string
  icon?: (props: TablerIconsProps) => JSX.Element
  href: string
}

interface Props {
  className: string
  entries: NavEntry[]
}

const navEntries = (env: Environment) => {
  const entries: NavEntry[] = []
  entries.push({
    title: 'assistants',
    href: '/admin/assistants',
  })
  entries.push({
    title: 'users',
    href: '/admin/users',
  })
  env.enableWorkspaces &&
    entries.push({
      title: 'workspaces',
      href: '/admin/workspaces',
    })
  entries.push({
    title: 'backends',
    href: '/admin/backends',
  })

  env.enableTools &&
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

export function Navbar({ className, entries }: Props) {
  const { t } = useTranslation('common')
  const pathname = usePathname()
  const filteredEntries = entries.filter((entry) => pathname.startsWith(entry.href))
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
      </ul>
    </nav>
  )
}

export default Navbar
