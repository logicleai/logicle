import { UpdatePasswordPage } from '@/components/app/UpdatePassword'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Change Password',
}

const Password = () => {
  return <UpdatePasswordPage />
}

export default Password
