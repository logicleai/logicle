'use client'

import { useParams } from 'next/navigation'
import { User } from '../components/User'

const UserPage = () => {
  const params = useParams() as { userId: string }
  const { userId } = params
  return <User userId={userId}></User>
}

export default UserPage
