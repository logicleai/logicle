import jackson from '@/lib/jackson'
import env from '@/lib/env'
import Login from './LoginPanel'
import { Metadata } from 'next'
import { getUserCount } from '@/models/user'

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage() {
  const { apiController } = await jackson()
  const userCount = await getUserCount()
  const connections = await apiController.getConnections({
    tenant: 'app',
    product: env.product,
  })
  const enableSignup = env.signup.enable || userCount == 0
  const connectionsFormatted = connections.map((connection) => {
    const idpMetadata = 'idpMetadata' in connection ? connection.idpMetadata : undefined
    const oidcProvider = 'oidcProvider' in connection ? connection.oidcProvider : undefined

    const name =
      connection.name ||
      (idpMetadata
        ? idpMetadata.friendlyProviderName || idpMetadata.provider
        : `${oidcProvider?.provider}`)

    return {
      clientID: connection.clientID,
      name,
    }
  })
  return <Login connections={connectionsFormatted} enableSignup={enableSignup} />
}
