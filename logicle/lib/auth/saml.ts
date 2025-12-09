// lib/auth/saml.ts
export const runtime = 'nodejs'
import { db } from '@/db/database'
import { getUserByEmail } from '@/models/user'
import { Profile, SamlConfig } from '@node-saml/node-saml'

interface SSOConnectionBase {
  name: string
  description: string
}

export interface OIDCSSORecord extends SSOConnectionBase {
  oidcProvider: {
    discoveryUrl: string
    clientId: string
    clientSecret: string
  }
}

export interface SAMLSSORecord extends SSOConnectionBase {
  idpMetadata: {
    entityID: string
    sso: {
      postUrl?: string
      redirectUrl?: string
    }
    publicKey?: string
  }
}

export type SSOConnection = SAMLSSORecord | OIDCSSORecord

export interface IdentityProviderRaw {
  key: string
  data: SSOConnection
}

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

export const jsonToIdentityProvider = (entry: any) => {
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
}
export const findIdentityProvider = async (key: string): Promise<IdentityProvider | undefined> => {
  const item = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('key', '=', key)
    .executeTakeFirst()
  if (item) {
    return jsonToIdentityProvider(JSON.parse(item.value))
  }
  return undefined
}

export const listIdentityProvidersRaw = async (): Promise<IdentityProviderRaw[]> => {
  const list = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('namespace', '=', 'saml:config')
    .execute()
  return list.map((entry) => {
    return {
      key: entry.key,
      data: JSON.parse(entry.value),
    }
  })
}

export const findIdentityProvidersRaw = async (
  key: string
): Promise<IdentityProviderRaw | undefined> => {
  const entry = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('key', '=', key)
    .executeTakeFirst()
  if (entry) {
    return {
      key: entry.key,
      data: JSON.parse(entry.value),
    }
  } else return undefined
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
