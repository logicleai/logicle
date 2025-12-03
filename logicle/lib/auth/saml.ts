// lib/auth/saml.ts
import { db } from '@/db/database'
import { getUserByEmail } from '@/models/user'
import {
  Strategy as SamlStrategy,
  SamlConfig,
  Profile,
  VerifiedCallback,
} from '@node-saml/passport-saml'
import type { Strategy } from 'passport'

export const findSamlIdentityProvider = async (clientId: string): Promise<SamlConfig> => {
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
      const { sso, publicKey, provider } = entry.idpMetadata
      const { postUrl } = sso
      return {
        entryPoint: postUrl,
        callbackUrl: `${process.env.APP_URL}/api/oauth/saml`,
        idpCert: publicKey,
        issuer: 'https://andrai.foosoft.it',
        wantAuthnResponseSigned: false,
      } satisfies SamlConfig
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

export async function createSamlStrategy(connectionId: string): Promise<Strategy> {
  const samlConfig = await findSamlIdentityProvider(connectionId)

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

  const strategy = new SamlStrategy(samlConfig as any, signonVerify, logoutVerify)

  // SamlStrategy extends passport.Strategy, so this cast is fine
  return strategy as Strategy
}
