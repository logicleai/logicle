import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cog6ToothIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import type { Workspace } from '@/types/dto'
import { AdminPageTitle } from '../../components/AdminPageTitle'
import Link from 'next/link'

interface WorkspaceTabProps {
  activeTab: string
  workspace: Workspace
}

const WorkspaceTab = (props: WorkspaceTabProps) => {
  const { activeTab, workspace } = props
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
      <AdminPageTitle title={`Workspace ${workspace.name}`} />
      <Tabs value={activeTab}>
        <TabsList>
          {navigations.map((menu) => {
            return (
              <Link href={`/admin/workspaces/${workspace.slug}/${menu.value}`} key={menu.value}>
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

export default WorkspaceTab
