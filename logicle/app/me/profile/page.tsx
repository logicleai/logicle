import { Metadata } from 'next'
import { ProfilePage } from '../components/ProfilePage'

export const metadata: Metadata = {
  title: 'Profile',
}

export default async function UserProfilePage() {
  return <ProfilePage />
}
