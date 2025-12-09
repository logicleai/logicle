import env from '@/lib/env'
import Login from './LoginPanel'
import { Metadata } from 'next'
import { getUserCount } from '@/models/user'
import { listIdpConnections } from '@/models/sso'

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage() {
  const userCount = await getUserCount()
  const identityProviders = await listIdpConnections()
  const enableSignup = env.signup.enable || userCount === 0
  return <Login connections={identityProviders} enableSignup={enableSignup} />
}
