'use client'
import UpdateAccount from '@/components/app/UpdateAccount'
import { WithLoadingAndError } from '@/components/ui'
import { useUser } from '@/hooks/users'
import { useParams } from 'next/navigation'

const Settings = () => {
  const params = useParams()
  const { userId } = params!
  const { isLoading, error, data: user } = useUser(userId + '')
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {user && <UpdateAccount user={user}></UpdateAccount>}
    </WithLoadingAndError>
  )
}

export default Settings
