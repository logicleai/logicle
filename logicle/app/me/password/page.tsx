import { Metadata } from 'next'
import { UpdatePasswordPage } from '../components/UpdatePasswordPage'

export const metadata: Metadata = {
  title: 'Password',
}

export default async function UpdatePassword() {
  return <UpdatePasswordPage />
}
