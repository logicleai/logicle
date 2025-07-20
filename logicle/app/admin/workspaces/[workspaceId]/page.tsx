'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useState } from 'react'
import { useWorkspace } from '@/hooks/workspaces'
import { useParams } from 'next/navigation'
import { AdminPage } from '../../components/AdminPage'
import { WorkspaceMembers } from '../components/WorkspaceMembers'
import { WorkspaceSettings } from '../components/WorkspaceSettings'
import { useTranslation } from 'react-i18next'
import { WorkspaceAssistants } from '../components/WorkspaceAssistants'

const tabs = ['settings', 'members', 'assistants'] as const
type TabId = (typeof tabs)[number]

const WorkspacePage = () => {
  const { workspaceId } = useParams() as { workspaceId: string }
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const { isLoading, error, data: workspace } = useWorkspace(workspaceId)
  const { t } = useTranslation()

  return (
    <AdminPage isLoading={isLoading} error={error} title={`Workspace ${workspace?.name ?? ''}`}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
        <TabsList>
          {tabs.map((tab) => {
            return (
              <TabsTrigger role="tab" key={tab} value={tab}>
                {t(tab)}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>
      {activeTab == 'settings' && <WorkspaceSettings workspaceId={workspaceId} />}
      {activeTab == 'members' && <WorkspaceMembers workspaceId={workspaceId}></WorkspaceMembers>}
      {activeTab == 'assistants' && (
        <WorkspaceAssistants workspaceId={workspaceId}></WorkspaceAssistants>
      )}
    </AdminPage>
  )
}

export default WorkspacePage
