'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUserProfile } from '../providers/userProfileContext'
import { UpdateAccountForm } from './UpdateAccount'
import { UserPreferences } from './UserPreferences'
import { UpdatePasswordForm } from './UpdatePassword'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEnvironment } from '@/app/context/environmentProvider'
import { Prop, PropList } from '@/components/ui/proplist'
import { ParametersPanel } from '@/app/me/components/ParametersPage'
import { UserApiKeysPanel } from '@/components/app/UserApiKeysPanel'

interface Props {
  onClose: () => void
}

const tabs = ['profile', 'preferences', 'password', 'app_info', 'parameters', 'api_keys'] as const
type TabId = (typeof tabs)[number]

export const UpdateAccountPanel = ({ className }: { className?: string }) => {
  const user = useUserProfile()
  if (!user) return null
  return <UpdateAccountForm className={className} user={user}></UpdateAccountForm>
}

export const About = () => {
  const { t } = useTranslation()
  const environment = useEnvironment()
  return (
    <PropList>
      <Prop label={t('version')} wrap={true}>
        {environment.appVersion}
      </Prop>
    </PropList>
  )
}

export const UserDialog = ({ onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const userProfile = useUserProfile()
  const { t } = useTranslation()
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[50em] h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="border-b mb-2 pb-2">
          <DialogTitle>{t('settings')}</DialogTitle>
        </DialogHeader>
        <Tabs
          orientation="vertical"
          className="flex flex-horz flex-1 gap-3 h-0"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabId)}
        >
          <TabsList direction="vertical">
            {tabs
              .filter((tabId) => tabId !== 'password' || !userProfile?.ssoUser)
              .map((tabId) => {
                return (
                  <TabsTrigger key={tabId} value={tabId}>
                    {t(tabId)}
                  </TabsTrigger>
                )
              })}
          </TabsList>
          <ScrollArea className="overflow-hidden h-100 flex-1 pr-4">
            <div className="p-2">
              <TabsContent value="profile">
                <UpdateAccountPanel></UpdateAccountPanel>
              </TabsContent>
              <TabsContent value="preferences">
                <UserPreferences></UserPreferences>
              </TabsContent>
              <TabsContent value="password">
                <UpdatePasswordForm></UpdatePasswordForm>
              </TabsContent>
              <TabsContent value="app_info">
                <About></About>
              </TabsContent>
              {userProfile && (
                <TabsContent value="parameters">
                  <ParametersPanel user={userProfile} />
                </TabsContent>
              )}
              <TabsContent value="api_keys">
                <UserApiKeysPanel />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
