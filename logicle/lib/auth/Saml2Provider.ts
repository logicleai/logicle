import CredentialsProvider from 'next-auth/providers/credentials'
import { serviceProvider, identityProvider } from '@/lib/saml'
import { SAMLAssertResponse } from 'saml2-js'
import { getUserByEmail } from '@/models/user'
import { InvalidCredentialsError } from './InvalidCredentialError'

export const saml2Provider = CredentialsProvider({
  id: 'saml2',
  name: 'SAML SSO',
  credentials: {
    samlBody: { label: 'SAML Response', type: 'hidden' },
  },
  async authorize({ samlBody }: any) {
    const parsed = JSON.parse(decodeURIComponent(samlBody))
    const response = (await new Promise((resolve, reject) =>
      serviceProvider.post_assert(identityProvider, { request_body: parsed }, (err, result) =>
        err ? reject(err) : resolve(result)
      )
    )) as SAMLAssertResponse

    const user = await getUserByEmail(response.user.name_id)

    if (!user) {
      throw new InvalidCredentialsError('unknown user')
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    }
  },
})
