// lib/auth/saml.ts
export const runtime = 'nodejs'
import { SAML } from '@node-saml/node-saml'
import * as dto from '@/types/dto'
import env from '@/lib/env'
export { findEmailInSamlProfile } from './ssoIdentity'

export function createSaml(config: dto.SAMLConfig) {
  return new SAML({
    // This login flow only supports redirect-based SAML initiation today.
    // Keep using the IdP redirect binding until POST initiation is implemented in
    // https://github.com/logicleai/logicle/issues/818.
    entryPoint: config.sso.redirectUrl,
    callbackUrl: `${env.appUrl}/api/oauth/saml`,
    idpCert: config.publicKey!,
    issuer: env.appUrl, // This is a sensible default value, and it's quite typical that the IdP is configured after the application (SP)
    disableRequestedAuthnContext: true,
    wantAuthnResponseSigned: false,
  })
}
export async function getSamlLoginRedirectUrl(
  host: string | undefined,
  idpConnection: dto.SamlIdpConnection,
  state: string
) {
  const saml = createSaml(idpConnection.config)
  const relayState = JSON.stringify({ connectionId: idpConnection.id, state })
  const url = await saml.getAuthorizeUrlAsync(relayState, host, {
    additionalParams: {
      RelayState: relayState,
    },
  })
  return url
}
