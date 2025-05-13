// lib/saml.ts
import { ServiceProvider, IdentityProvider } from 'saml2-js'
import fs from 'fs'
import path from 'path'
import env from './env'
import { db } from '@/db/database'
import { logger } from './logging'

const readFileOrBlank = (path: string) => {
  try {
    return fs.readFileSync(path).toString()
  } catch {
    logger.error(`Failed reading ${path}: saml2 authorization won't work`)
    return ''
  }
}

export const serviceProvider = new ServiceProvider({
  entity_id: env.appUrl,
  private_key: readFileOrBlank(path.join(process.cwd(), 'certs/key.pem')),
  certificate: readFileOrBlank(path.join(process.cwd(), 'certs/public.crt')),
  assert_endpoint: `${env.appUrl}/api/oauth/saml`,
  allow_unencrypted_assertion: true,
})

export const findSamlIdentityProvider = async (clientId: string) => {
  const list = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('key', 'like', 'saml:config:%')
    .execute()
  const identityProvider = list
    .map((entry) => {
      const entryObject = JSON.parse(entry.value)
      const { clientID, idpMetadata } = entryObject
      return {
        clientID,
        idpMetadata,
      }
    })
    .filter((entry) => entry.clientID == clientId)
    .map((entry) => {
      const { sso, publicKey } = entry.idpMetadata
      const { postUrl } = sso
      return new IdentityProvider({
        sso_login_url: postUrl,
        sso_logout_url: postUrl,
        certificates: publicKey,
      })
    })
    .find(() => true)
  return identityProvider
}

export interface SAMLIdentityProvider {
  type: 'SAML'
  identityProvider: IdentityProvider
}

export interface OIDCIdentityProvider {
  type: 'OIDC'
  identityProvider: {
    clientId: string
    clientSecret: string
    discoveryUrl: string
  }
}

export type BoxyHQIdentityProvider = SAMLIdentityProvider | OIDCIdentityProvider

export const findIdentityProvider = async (
  clientId: string
): Promise<BoxyHQIdentityProvider | undefined> => {
  const list = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('key', 'like', 'saml:config:%')
    .execute()
  const identityProvider = list
    .map((entry) => {
      const entryObject = JSON.parse(entry.value)
      const { clientID, clientSecret, idpMetadata, oidcProvider } = entryObject
      return {
        clientID,
        clientSecret,
        idpMetadata,
        oidcProvider,
      }
    })
    .filter((entry) => entry.clientID == clientId)
    .map((entry) => {
      if (entry.idpMetadata) {
        const { sso, publicKey } = entry.idpMetadata
        const { postUrl } = sso
        return {
          type: 'SAML',
          identityProvider: new IdentityProvider({
            sso_login_url: postUrl,
            sso_logout_url: postUrl,
            certificates: publicKey,
          }),
        } as SAMLIdentityProvider
      } else {
        const { clientId, clientSecret, discoveryUrl } = entry.oidcProvider
        return {
          type: 'OIDC',
          identityProvider: {
            clientId: clientId,
            clientSecret: clientSecret,
            discoveryUrl: discoveryUrl,
          },
        } as OIDCIdentityProvider
      }
    })
    .find(() => true)
  return identityProvider
}
