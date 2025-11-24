import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Prop, PropList } from '@/components/ui/proplist'
import { useUser } from '@/hooks/users'
import { useState } from 'react'
import { AdminPage } from '../../components/AdminPage'
import { UpdatePasswordForAdmin } from '../components/UpdatePasswordForAdmin'
import { useTranslation } from 'react-i18next'
import * as dto from '@/types/dto'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiKeys } from '../components/ApiKeys'
import { useEnvironment } from '@/app/context/environmentProvider'
import { UpdateAccountForm } from '@/components/app/UpdateAccount'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const tabs = ['settings', 'api_keys'] as const
type TabId = (typeof tabs)[number]

const UserCard = ({ user }: { user: dto.User }) => {
  const { t } = useTranslation()
  const environment = useEnvironment()
  const [editingUser, setEditingUser] = useState<boolean>(false)
  const [updatingPassword, setUpdatingPassword] = useState<boolean>(false)
  return (
    <Card className="text-body1 space-y-3 p-2">
      <PropList>
        <Prop label={t('id')}>{user.id ?? '<unspecified>'}</Prop>
        <Prop label={t('name')}>{user.name}</Prop>
        <Prop label={t('email')}>{user.email}</Prop>
        {environment.userProperties.map((prop) => {
          return (
            <Prop key={prop.id} label={prop.name}>
              {user.properties[prop.id]}
            </Prop>
          )
        })}
        <Prop label={t('auth-methods')}>{user.ssoUser ? t('sso_user') : t('any_available')}</Prop>
      </PropList>
      <div className="flex flex-horz gap-3">
        <Button variant="primary" onClick={() => setEditingUser(true)}>
          {t('edit')}
        </Button>
        <Button variant="secondary" onClick={() => setUpdatingPassword(true)}>
          {t('change-password')}
        </Button>
      </div>
      {updatingPassword && (
        <UpdatePasswordForAdmin
          user={user}
          onClose={() => setUpdatingPassword(false)}
        ></UpdatePasswordForAdmin>
      )}
      {editingUser && (
        <Dialog open={true} onOpenChange={() => setEditingUser(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('update-account')}</DialogTitle>
            </DialogHeader>
            <UpdateAccountForm
              onClose={() => setEditingUser(false)}
              user={user}
            ></UpdateAccountForm>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

export const User = ({ userId }: { userId: string }) => {
  const { isLoading, error, data: user } = useUser(`${userId}`)
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const { t } = useTranslation()
  const environment = useEnvironment()

  return (
    <AdminPage isLoading={isLoading} error={error} title={`User ${user?.name ?? ''}`}>
      {environment.enableApiKeys ? (
        <>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
            <TabsList>
              {tabs.map((menu) => {
                return (
                  <TabsTrigger role="tab" key={menu} value={menu}>
                    {t(menu)}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
          {activeTab === 'api_keys' && <ApiKeys userId={userId}></ApiKeys>}
          {activeTab === 'settings' && user && <UserCard user={user} />}
        </>
      ) : (
        user && <UserCard user={user} />
      )}
    </AdminPage>
  )
}
