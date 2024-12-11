'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUserProfile } from '../providers/userProfileContext'
import UpdateAccount from './UpdateAccount'
import { UserPreferences } from './UserPreferences'
import UpdatePassword from './UpdatePassword'

interface Props {
  onClose: () => void
}

const tabs = ['profile', 'properties', 'password'] as const
type TabId = (typeof tabs)[number]

const AccountPage = () => {
  const user = useUserProfile()
  if (!user) return null
  return <UpdateAccount user={user}></UpdateAccount>
}

export const UserDialog = ({ onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const { t } = useTranslation('common')
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[80%]">
        <DialogHeader>
          <DialogTitle>{t('create-oidc-connection')}</DialogTitle>
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
        </Tabs>
        {activeTab == 'profile' && <AccountPage></AccountPage>}
        {activeTab == 'properties' && <UserPreferences></UserPreferences>}
        {activeTab == 'password' && <UpdatePassword />}
      </DialogContent>
    </Dialog>
  )
}
