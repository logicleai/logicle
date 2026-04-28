import env from '@/lib/env'
import Login from './LoginPanel'
import { Metadata } from 'next'
import { getLoginPageConfig } from '@/backend/lib/app-config'

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage() {
  const { userCount, identityProviders } = await getLoginPageConfig()
  const enableSignup = env.signup.enable || userCount === 0
  return <Login connections={identityProviders} enableSignup={enableSignup} />
}
