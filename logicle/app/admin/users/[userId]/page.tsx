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
import { SelectableUserDTO } from '@/types/user'

const Settings = () => {
  const params = useParams()
  const { userId } = params!
  const { isLoading, error, data: user } = useUser(userId + '')
  const [editing, setEditing] = useState<boolean>(false)
  const { t } = useTranslation('common')
  const router = useRouter()

  const editUser = (user: SelectableUserDTO) => {
    router.push(`/admin/users/${user.id}/edit`)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={`User ${user?.name ?? ''}`}>
      <Card className="text-body1 space-y-3 p-2">
        {user && (
          <>
            <PropList>
              <Prop label="Id">{user.id ?? '<unspecified>'}</Prop>
              <Prop label="Name">{user.name}</Prop>
              <Prop label="email">{user.email}</Prop>
            </PropList>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('change_password')}
            </Button>
            <Button variant="primary" onClick={() => editUser(user)}>
              {t('edit')}
            </Button>
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
