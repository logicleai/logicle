// lib/auth/saml.ts
export const runtime = 'nodejs'
import { db } from '@/db/database'
import { SamlConfig } from '@node-saml/node-saml'

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
    .filter((entry) => entry.clientID == clientId)
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
