'use client'

import { User } from '../components/User'
import { useUrlSegment } from '@/hooks/useUrlSegment'

const UserPage = () => {
  const userId = useUrlSegment(2)
  return <User userId={userId}></User>
}

export default UserPage
