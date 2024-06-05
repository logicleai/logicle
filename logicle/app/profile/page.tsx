import { getUserFromSession } from '@/models/user'
import UpdateAccount from '@/components/app/UpdateAccount'
import { auth } from 'auth'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Profile',
}

const AccountPage = async () => {
  const session = await auth()
  if (!session) {
    return null
  }
  const user = await getUserFromSession(session)
  if (!user) {
    return null
  }
  return <UpdateAccount user={user} />
}

export default AccountPage
