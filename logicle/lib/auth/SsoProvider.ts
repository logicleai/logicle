import CredentialsProvider from 'next-auth/providers/credentials'
import { serviceProvider, findSamlIdentityProvider, findIdentityProvider } from '@/lib/saml'
import { SAMLAssertResponse } from 'saml2-js'
import { getUserByEmail } from '@/models/user'
import { InvalidCredentialsError } from './InvalidCredentialError'
import env from '../env'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export const ssoProvider = CredentialsProvider({
  id: 'saml2',
  name: 'SAML SSO',
  credentials: {
    samlBody: { label: 'SAML Response', type: 'hidden' },
  },
  async authorize({ samlBody }: any) {
    const parsed = JSON.parse(decodeURIComponent(samlBody))
    const { RelayState: clientId, code } = parsed
    const identityProvider = await findIdentityProvider(clientId)
    if (!identityProvider) {
      throw new InvalidCredentialsError(`Invalid SAML Identity Provider:  ${clientId}`)
    }
    if (identityProvider.type == 'SAML') {
      const response = (await new Promise((resolve, reject) =>
        serviceProvider.post_assert(
          identityProvider.identityProvider,
          { request_body: parsed },
          (err, result) => (err ? reject(err) : resolve(result))
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
    } else {
      let discoveryDoc: any
      try {
        // 2. Fetch the discovery document
        const res = await fetch(identityProvider.identityProvider.discoveryUrl)
        if (!res.ok) {
          throw new Error(`Failed to fetch discovery document: ${res.status}`)
        }
        discoveryDoc = await res.json()
      } catch (error) {
        console.error('OIDC discovery fetch error:', error)
        throw new InvalidCredentialsError('Unable to fetch OIDC configuration')
      }
      const tokenEndpoint: string = discoveryDoc.token_endpoint

      // 1. Build the token request body
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: identityProvider.identityProvider.clientId,
        client_secret: identityProvider.identityProvider.clientSecret,
        redirect_uri: `${env.oidc.redirectUrl}`,
      })

      let tokenResponse
      try {
        const resp = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })
        if (!resp.ok) {
          const err = await resp.text()
          console.error('Token endpoint error:', resp.status, err)
          throw new InvalidCredentialsError('Unable to get the token from Idp')
        }
        tokenResponse = await resp.json()
      } catch (err) {
        console.error('Network error fetching token:', err)
        throw new InvalidCredentialsError('Error communicating with identity provider')
      }

      // 3. Validate and return the token
      if (!tokenResponse.access_token) {
        console.error('No access_token in response', tokenResponse)
        throw new InvalidCredentialsError('Invalid token response from provider')
      }

      // 2) Verify the token:
      const jwks = createRemoteJWKSet(new URL(discoveryDoc.jwks_uri))
      let verified
      try {
        verified = await jwtVerify(tokenResponse.id_token, jwks, {
          issuer: discoveryDoc.issuer, // e.g. "https://keycloak.example.com/..."
          audience: identityProvider.identityProvider.clientId, // must match your client
        })
      } catch (err) {
        console.error('ID Token verification failed', err)
        throw new InvalidCredentialsError('Failed validating token')
      }

      // Extract user info
      const { email } = verified.payload
      const user = await getUserByEmail(email as string)
      if (!user) {
        throw new InvalidCredentialsError('unknown user')
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      }
    }
  },
})
