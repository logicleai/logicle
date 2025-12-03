// lib/auth/saml.ts
import { db } from '@/db/database'
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
      } satisfies SamlConfig
    })
    .find(() => true)
  return identityProvider!
}

async function findOrCreateUserFromSaml(profile: Profile, connectionId: string) {
  const email =
    (profile as any).email ||
    (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']

  if (!email) {
    throw new Error('No email in SAML profile')
  }

  // TODO: look up or create user in your DB
  const user = {
    id: 'some-id-from-db',
    email,
    role: 'user',
    connectionId,
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

    // Can't make this function async (type is () => void),
    // so we bridge the promise manually:
    findOrCreateUserFromSaml(profile, connectionId)
      .then((user) => done(null, user))
      .catch((err) => done(err))
  }

  // logout verification – if you don’t care about SLO user mapping yet,
  // you can just accept it and return no user
  const logoutVerify = (_profile: Profile | null | undefined, done: VerifiedCallback): void => {
    // You could also look up user here if you need to
    done(null, undefined)
  }

  const strategy = new SamlStrategy(samlConfig as any, signonVerify, logoutVerify)

  // SamlStrategy extends passport.Strategy, so this cast is fine
  return strategy as Strategy
}
