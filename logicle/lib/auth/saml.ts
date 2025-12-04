// lib/auth/saml.ts
export const runtime = 'nodejs'
import { db } from '@/db/database'
import { getUserByEmail } from '@/models/user'
import {
  Strategy as SamlStrategy,
  SamlConfig,
  Profile,
  VerifiedCallback,
} from '@node-saml/passport-saml'
import type { Strategy } from 'passport'
import OpenIDConnectStrategy, {
  SessionStore,
  VerifyCallback,
} from '@govtechsg/passport-openidconnect'
import { NextResponse } from 'next/server'

interface SamlIdentityProvider {
  type: 'SAML'
  config: SamlConfig
}

interface OidcIdentityProvider {
  type: 'OIDC'
  config: {
    clientId: string
    clientSecret: string
    discoveryUrl: string
  }
}

type IdentityProvider = SamlIdentityProvider | OidcIdentityProvider

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

async function findOrCreateUserFromSaml(profile: Profile, connectionId: string) {
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

export async function createPassportStrategy(connectionId: string): Promise<Strategy> {
  const identityProvider = await findIdentityProvider(connectionId)
  if (identityProvider.type == 'SAML') {
    // sign-on verification (login)
    const signonVerify = (profile: Profile | null | undefined, done: VerifiedCallback): void => {
      if (!profile) {
        return done(new Error('Empty SAML profile'))
      }
      findOrCreateUserFromSaml(profile, connectionId)
        .then((user) => done(null, user as unknown as Record<string, unknown>))
        .catch((err) => done(err))
    }

    // logout verification – if you don’t care about SLO user mapping yet,
    // you can just accept it and return no user
    const logoutVerify = (_profile: Profile | null | undefined, done: VerifiedCallback): void => {
      done(null, undefined)
    }

    const strategy = new SamlStrategy(identityProvider.config, signonVerify, logoutVerify)

    // SamlStrategy extends passport.Strategy, so this cast is fine
    return strategy as Strategy
  } else {
    let discoveryDoc: any
    try {
      // 2. Fetch the discovery document
      const res = await fetch(identityProvider.config.discoveryUrl)
      if (!res.ok) {
        throw new Error(`Failed to fetch discovery document: ${res.status}`)
      }
      discoveryDoc = await res.json()
    } catch (error) {
      console.error('OIDC discovery fetch error:', error)
      return NextResponse.json({ error: 'Unable to fetch OIDC configuration' }, { status: 500 })
    }
    const strategy = new OpenIDConnectStrategy(
      {
        issuer: discoveryDoc.issuer,
        authorizationURL: discoveryDoc.authorization_endpoint,
        tokenURL: discoveryDoc.token_endpoint,
        callbackURL: `${process.env.APP_URL}/api/oauth/saml`,
        userInfoURL: '',
        clientID: identityProvider.config.clientId,
        clientSecret: identityProvider.config.clientSecret,
        store: new SessionStore({ key: '' }),
      } satisfies OpenIDConnectStrategy.StrategyOptions,
      (issuer: string, profile: OpenIDConnectStrategy.Profile, done: VerifyCallback) => {
        try {
          const user = null
          done(null, user!)
        } catch (err) {
          done(err as Error)
        }
      }
    )
    // SamlStrategy extends passport.Strategy, so this cast is fine
    return strategy as Strategy
  }
}
