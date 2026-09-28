'use client'
import { useTranslation } from 'react-i18next'
import { Link } from '@/components/ui/link'
import { usePathname } from 'next/navigation'
import { TablerIcon } from '@tabler/icons-react'

export interface NavEntry {
  title: string
  icon?: TablerIcon
  href: string
  badge?: number
}

interface Props {
  className: string
  entries: NavEntry[]
}

export function Navbar({ className, entries }: Props) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const filteredEntries = entries.filter((entry) => pathname.startsWith(entry.href))
  const match =
    filteredEntries.length === 0
      ? { href: undefined }
      : filteredEntries.reduce((a, b) => {
          return a.href.length > b.href.length ? a : b
        })
  return (
    <nav className={className}>
      <ul className="flex flex-col text-h3">
        {entries.map((item) => (
          <li key={`li-${item.href}`} className="relative">
            <Link
              className={`w-full px-2 py-3 ${
                item.href === match.href ? '' : 'hover:bg-secondary-hover/50'
              }`}
              variant={item.href === match.href ? 'sidebar_active' : 'ghost'}
              icon={item.icon}
              href={item.href}
            >
              {t(item.title)}
            </Link>
            {item.badge && item.badge > 0 && (
              <span className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Navbar
