// lib/auth/saml.ts
export const runtime = 'nodejs'
import { getUserByEmail } from '@/models/user'
import { Profile, SAML } from '@node-saml/node-saml'
import * as dto from '@/types/dto'

export async function getSamlLoginRedirectUrl(req: Request, idpConnection: dto.SamlIdpConnection) {
  const saml = new SAML({
    entryPoint: idpConnection.config.sso.postUrl,
    callbackUrl: `${process.env.APP_URL}/api/oauth/saml`,
    idpCert: idpConnection.config.publicKey!,
    issuer: 'https://andrai.foosoft.it',
    wantAuthnResponseSigned: false,
  })
  const relayState = JSON.stringify({ connectionId: idpConnection.id })
  const host = req.headers.get('host') ?? undefined
  const url = await saml.getAuthorizeUrlAsync(relayState, host, {
    additionalParams: {
      RelayState: relayState,
    },
  })
  return url
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
