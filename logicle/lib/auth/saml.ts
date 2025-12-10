// lib/auth/saml.ts
export const runtime = 'nodejs'
import { Profile, SAML } from '@node-saml/node-saml'
import * as dto from '@/types/dto'
import env from '../env'

export function createSaml(config: dto.SAMLConfig) {
  return new SAML({
    entryPoint: config.sso.postUrl,
    callbackUrl: `${process.env.APP_URL}/api/oauth/saml`,
    idpCert: config.publicKey!,
    issuer: env.appUrl, // This is a sensible default value, and it's quite typical that the IdP is configured after the application (SP)
    wantAuthnResponseSigned: false,
  })
}
export async function getSamlLoginRedirectUrl(req: Request, idpConnection: dto.SamlIdpConnection) {
  const saml = createSaml(idpConnection.config)
  const relayState = JSON.stringify({ connectionId: idpConnection.id })
  const host = req.headers.get('host') ?? undefined
  const url = await saml.getAuthorizeUrlAsync(relayState, host, {
    additionalParams: {
      RelayState: relayState,
    },
  })
  return url
}

export function findEmailInSamlProfile(profile: Profile): string {
  return (
    (profile as any).mail ||
    (profile as any).nameID ||
    (profile as any).email ||
    (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
  )
}
