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
        {entries.map((item) => (
          <li key={`li-${item.href}`}>
            <Link
              className={`w-full px-2 py-3 ${
                item.href == match.href ? '' : 'hover:bg-secondary_color_hover/50'
              }`}
              variant={item.href == match.href ? 'sidebar_active' : 'ghost'}
              icon={item.icon}
              href={item.href}
            >
              {t(item.title)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Navbar
