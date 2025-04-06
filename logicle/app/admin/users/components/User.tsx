import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Prop, PropList } from '@/components/ui/proplist'
import { mutateUser, useUser } from '@/hooks/users'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AdminPage } from '../../components/AdminPage'
import { UpdatePasswordForAdmin } from '../components/UpdatePasswordForAdmin'
import { useTranslation } from 'react-i18next'
import * as dto from '@/types/dto'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiKeys } from '../components/ApiKeys'
import { useEnvironment } from '@/app/context/environmentProvider'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'

const tabs = ['settings', 'api-keys'] as const
type TabId = (typeof tabs)[number]

const UserCard = ({ user }: { user: dto.User }) => {
  const router = useRouter()
  const { t } = useTranslation()
  const [editing, setEditing] = useState<boolean>(false)
  const editUser = (user: dto.User) => {
    router.push(`/admin/users/${user.id}/edit`)
  }
  const onRemovePassword = async () => {
    const response = await delete_(`/api/users/${user.id}/password`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('password-successfully-removed'))
    mutateUser(user.id)
  }
  return (
    <Card className="text-body1 space-y-3 p-2">
      {user && (
        <>
          <PropList>
            <Prop label={t('id')}>{user.id ?? '<unspecified>'}</Prop>
            <Prop label={t('name')}>{user.name}</Prop>
            <Prop label={t('email')}>{user.email}</Prop>
          </PropList>
          <div className="flex flex-horz gap-3">
            <Button variant="primary" onClick={() => editUser(user)}>
              {t('edit')}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('change-password')}
            </Button>
            {user.password && user.password !== '' && (
              <Button variant="secondary" onClick={() => onRemovePassword()}>
                {t('remove-password')}
              </Button>
            )}
          </div>
          {editing && (
            <UpdatePasswordForAdmin
              user={user}
              onClose={() => setEditing(false)}
            ></UpdatePasswordForAdmin>
          )}
        </>
      )}
    </Card>
  )
}

export const User = ({ userId }: { userId: string }) => {
  const { isLoading, error, data: user } = useUser(userId + '')
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
          {activeTab == 'api-keys' && <ApiKeys userId={userId}></ApiKeys>}
          {activeTab == 'settings' && user && <UserCard user={user} />}
        </>
      ) : (
        user && <UserCard user={user} />
      )}
    </AdminPage>
  )
}
