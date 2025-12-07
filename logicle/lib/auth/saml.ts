// lib/auth/saml.ts
export const runtime = 'nodejs'
import { db } from '@/db/database'
import { getUserByEmail } from '@/models/user'
import { Profile, SamlConfig } from '@node-saml/node-saml'

interface SSOConnectionBase {
  defaultRedirectUrl: string
  redirectUrl: string[] | string
  tenant: string
  product: string
  name?: string
  label?: string
  description?: string
  sortOrder?: number | null
  acsUrlOverride?: string
  samlAudienceOverride?: string
}

export interface OIDCSSORecord extends SSOConnectionBase {
  clientID: string
  clientSecret: string
  oidcProvider: {
    provider: string | 'Unknown'
    friendlyProviderName: string | null
    discoveryUrl?: string
    clientId: string
    clientSecret: string
  }
  deactivated?: boolean
}

export interface SAMLSSOConnection extends SSOConnectionBase {
  forceAuthn?: boolean | string
  identifierFormat?: string
}

export interface SAMLSSORecord extends SAMLSSOConnection {
  clientID: string
  clientSecret: string
  metadataUrl?: string
  idpMetadata: {
    entityID: string
    loginType?: string
    provider: string | 'Unknown'
    friendlyProviderName: string | null
    slo: {
      postUrl?: string
      redirectUrl?: string
    }
    sso: {
      postUrl?: string
      redirectUrl?: string
    }
    thumbprint?: string
    publicKey?: string
    validTo?: string
  }
  deactivated?: boolean
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

const jsonToIdentityProvider = (entry: any) => {
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

export const listIdentityProviders = async (): Promise<IdentityProvider[]> => {
  const list = await db
    .selectFrom('JacksonStore')
    .selectAll()
    .where('tag', '=', 'saml:config')
    .execute()
  return list
    .map((entry) => {
      return JSON.parse(entry.value)
    })
    .map(jsonToIdentityProvider)
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
