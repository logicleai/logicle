import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cog6ToothIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import type { Team } from '@/types/db'
import { AdminPageTitle } from '../../components/AdminPageTitle'
import Link from 'next/link'

interface TeamTabProps {
  activeTab: string
  team: Team
}

const TeamTab = (props: TeamTabProps) => {
  const { activeTab, team } = props
  const navigations = [
    {
      name: 'Settings',
      value: 'settings',
      icon: Cog6ToothIcon,
    },
  ]

  navigations.push({
    name: 'Members',
    value: 'members',
    icon: UserPlusIcon,
  })

  return (
    <>
      <AdminPageTitle title={`Team ${team.name}`} />
      <Tabs value={activeTab}>
        <TabsList>
          {navigations.map((menu) => {
            return (
              <Link href={`/admin/teams/${team.slug}/${menu.value}`} key={menu.value}>
                <TabsTrigger role="tab" value={menu.value}>
                  {menu.name}
                </TabsTrigger>
              </Link>
            )
          })}
        </TabsList>
      </Tabs>
    </>
  )
}

export default TeamTab
