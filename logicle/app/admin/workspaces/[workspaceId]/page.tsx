'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useState } from 'react'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import { AdminPage } from '../../components/AdminPage'
import { WorkspaceMembers } from '../components/WorkspaceMembers'
import { WorkspaceSettings } from '../components/WorkspaceSettings'

type TabId = 'settings' | 'members'

interface TabDescription {
  name: string
  value: TabId
}

const navigations: TabDescription[] = [
  {
    name: 'Settings',
    value: 'settings',
  },
  {
    name: 'Members',
    value: 'members',
  },
]

const WorkspacePage = () => {
  const { workspaceId } = useParams() as { workspaceId: string }
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const { isLoading, error, data: workspace } = useWorkspace(workspaceId)

  return (
    <AdminPage isLoading={isLoading} error={error} title={`Workspace ${workspace?.name ?? ''}`}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
        <TabsList>
          {navigations.map((menu) => {
            return (
              <TabsTrigger role="tab" key={menu.value} value={menu.value}>
                {menu.name}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>
      {activeTab == 'settings' && <WorkspaceSettings workspaceId={workspaceId} />}
      {activeTab == 'members' && <WorkspaceMembers workspaceId={workspaceId}></WorkspaceMembers>}
    </AdminPage>
  )
}

export default WorkspacePage
