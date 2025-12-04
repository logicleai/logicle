// lib/auth/oidcStrategy.ts
import OpenIDConnectStrategy, {
  Profile as OidcProfile,
  VerifyCallback,
} from '@govtechsg/passport-openidconnect'

export interface OidcConfig {
  issuer: string
  authorizationURL: string
  tokenURL: string
  userInfoURL: string
  clientID: string
  clientSecret: string
  callbackURL: string
  scope?: string | string[]
}

export interface AppUser {
  id: string
  email?: string
  name?: string
  rawProfile: any
}

function mapOidcProfileToUser(profile: OidcProfile): AppUser {
  const raw = (profile as any)._json ?? profile // many providers put raw claims in _json
  const email = raw.email ?? raw.preferred_username ?? raw.upn ?? undefined

  return {
    id: profile.id,
    email,
    name: profile.displayName ?? raw.name ?? email ?? profile.id,
    rawProfile: raw,
  }
}

export function createOidcStrategy(config: OidcConfig) {
  return new OpenIDConnectStrategy(
    {
      issuer: config.issuer,
      authorizationURL: config.authorizationURL,
      tokenURL: config.tokenURL,
      userInfoURL: config.userInfoURL,
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      scope: config.scope ?? ['openid', 'profile', 'email'],
    },
    // verify callback – similar idea to your SAML verify
    (issuer: string, profile: OidcProfile, done: VerifyCallback) => {
      try {
        const user = mapOidcProfileToUser(profile)
        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }
  )
}
