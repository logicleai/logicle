// lib/auth/saml.ts
export const runtime = 'nodejs'
import { db } from '@/db/database'
import { getUserByEmail } from '@/models/user'
import { Profile, SamlConfig } from '@node-saml/node-saml'

export interface SamlIdentityProvider {
  type: 'SAML'
  config: SamlConfig
}

export interface OidcIdentityProvider {
  type: 'OIDC'
  config: {
    clientId: string
    clientSecret: string
    discoveryUrl: string
  }
}

export type IdentityProvider = SamlIdentityProvider | OidcIdentityProvider

export const findIdentityProvider = async (clientId: string): Promise<IdentityProvider> => {
  const list = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('key', 'like', 'saml:config:%')
    .execute()
  const identityProvider = list
    .map((entry) => {
      return JSON.parse(entry.value)
    })
    .filter((entry) => entry.clientID === clientId)
    .map((entry) => {
      if (entry.idpMetadata) {
        const { sso, publicKey } = entry.idpMetadata
        const { postUrl } = sso
        return {
          type: 'SAML' as const,
          config: {
            entryPoint: postUrl,
            callbackUrl: `${process.env.APP_URL}/api/oauth/saml`,
            idpCert: publicKey,
            issuer: 'https://andrai.foosoft.it',
            wantAuthnResponseSigned: false,
          } satisfies SamlConfig,
        }
      } else {
        const { clientId, clientSecret, discoveryUrl } = entry.oidcProvider
        return {
          type: 'OIDC' as const,
          config: {
            clientId,
            clientSecret,
            discoveryUrl,
          },
        }
      }
    })
    .find(() => true)
  return identityProvider!
}

export async function findUserFromSamlProfile(profile: Profile) {
  const email =
    (profile as any).mail ||
    (profile as any).nameID ||
    (profile as any).email ||
    (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']

  if (!email) {
    throw new Error('No email in SAML profile')
  }
  const user = await getUserByEmail(email as string)
  if (!user) {
    throw new Error('invalid-credentials')
  }
  return user
}
