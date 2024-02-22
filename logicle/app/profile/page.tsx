import { getUserBySession } from 'models/user'
import UpdateAccount from '@/components/app/UpdateAccount'
import { UserRoleName, roleDto } from '@/types/user'
import { auth } from 'auth'

const Account = async () => {
  const session = await auth()
  const user = await getUserBySession(session)
  if (!user) {
    return null
  }
  const userDTO = {
    ...user,
    role: roleDto(user.roleId) ?? UserRoleName.USER,
  }

  return <UpdateAccount user={userDTO} />
}

export default Account
