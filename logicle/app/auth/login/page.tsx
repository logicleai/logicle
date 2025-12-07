import env from '@/lib/env'
import Login from './LoginPanel'
import { Metadata } from 'next'
import { getUserCount } from '@/models/user'
import { jsonToIdentityProvider, listIdentityProvidersRaw } from '@/lib/auth/saml'

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage() {
  const userCount = await getUserCount()
  const identityProviders = await listIdentityProvidersRaw()
  const enableSignup = env.signup.enable || userCount === 0
  const connectionsFormatted = identityProviders.map((connection) => {
    return {
      clientID: connection.key,
      name: connection.data.name ?? '',
    }
  })
  return <Login connections={connectionsFormatted} enableSignup={enableSignup} />
}
