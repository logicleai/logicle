'use client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Prop, PropList } from '@/components/ui/proplist'
import { useUser } from '@/hooks/users'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { AdminPage } from '../../components/AdminPage'
import { UpdatePasswordForAdmin } from '../components/UpdatePasswordForAdmin'
import { useTranslation } from 'react-i18next'
import * as dto from '@/types/dto'

const Settings = () => {
  const params = useParams()
  const { userId } = params!
  const { isLoading, error, data: user } = useUser(userId + '')
  const [editing, setEditing] = useState<boolean>(false)
  const { t } = useTranslation('common')
  const router = useRouter()

  const editUser = (user: dto.User) => {
    router.push(`/admin/users/${user.id}/edit`)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={`User ${user?.name ?? ''}`}>
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
                {t('change_password')}
              </Button>
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
    </AdminPage>
  )
}

export default Settings
