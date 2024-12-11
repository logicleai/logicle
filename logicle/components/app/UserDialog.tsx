'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUserProfile } from '../providers/userProfileContext'
import { UpdateAccountForm } from './UpdateAccount'
import { UserPreferences } from './UserPreferences'
import { UpdatePasswordForm } from './UpdatePassword'

interface Props {
  onClose: () => void
}

const tabs = ['profile', 'properties', 'password'] as const
type TabId = (typeof tabs)[number]

const UpdateAccountPanel = ({ className }: { className?: string }) => {
  const user = useUserProfile()
  if (!user) return null
  return <UpdateAccountForm className={className} user={user}></UpdateAccountForm>
}

export const UserDialog = ({ onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const { t } = useTranslation('common')
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[60%] h-[80vh]">
        <div>
          <DialogHeader>
            <DialogTitle>{t('settings')}</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
            <TabsList>
              {tabs.map((tabId) => {
                return (
                  <TabsTrigger role="tab" key={tabId} value={tabId}>
                    {t(tabId)}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            <TabsContent value="profile">
              <UpdateAccountPanel></UpdateAccountPanel>
            </TabsContent>
            <TabsContent value="properties">
              <UserPreferences></UserPreferences>
            </TabsContent>
            <TabsContent value="password">
              <UpdatePasswordForm></UpdatePasswordForm>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
