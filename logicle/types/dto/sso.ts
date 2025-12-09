interface IdpConnectionBase {
  id: string
  name: string
  description: string
}

export interface OIDCConfig {
  discoveryUrl: string
  clientId: string
  clientSecret: string
}

export interface SAMLConfig {
  entityID: string
  sso: {
    postUrl?: string
    redirectUrl?: string
  }
  publicKey?: string
}

export interface SamlIdpConnection extends IdpConnectionBase {
  type: 'SAML'
  config: SAMLConfig
}

export interface OidcIdpConnection extends IdpConnectionBase {
  type: 'OIDC'
  config: OIDCConfig
}

export type IdpConnection = SamlIdpConnection | OidcIdpConnection
