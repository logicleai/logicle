import { MainLayout } from '@/app/layouts/MainLayout'
import { SettingsNavbar } from '@/components/ui'
import { NavEntry } from '../../components/ui/settings-navbar'

const Sidebar = ({ title, navEntries }: { title: string; navEntries: NavEntry[] }) => {
  return (
    <div className="flex flex-col px-3 py-6 gap-3 flex-1">
      <h2>{title}</h2>
      <SettingsNavbar entries={navEntries} className="flex-1" />
    </div>
  )
}

interface Props {
  title: string
  navEntries: NavEntry[]
  children: JSX.Element
}

export default function SettingsLayout({ title, navEntries, children }: Props) {
  return (
    <MainLayout leftBar={<Sidebar title={title} navEntries={navEntries} />}>
      <div className="flex-1 h-full bg-background px-4 py-6 lg:px-8 overflow-hidden">
        {children}
      </div>
    </MainLayout>
  )
}