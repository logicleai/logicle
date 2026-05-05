import { z } from 'zod'

export const idpConnectionBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
}).meta({ id: 'IdpConnectionBase' })

export const oidcConfigSchema = z.object({
  discoveryUrl: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
}).meta({ id: 'OidcConfig' })

export const samlConfigSchema = z.object({
  entityID: z.string(),
  sso: z
    .object({
      postUrl: z.string().optional(),
      redirectUrl: z.string().optional(),
    })
    .strict(),
  publicKey: z.string().optional(),
}).meta({ id: 'SamlConfig' })

export const samlIdpConnectionSchema = idpConnectionBaseSchema.extend({
  type: z.literal('SAML'),
  config: samlConfigSchema,
}).meta({ id: 'SamlIdpConnection' })

export const oidcIdpConnectionSchema = idpConnectionBaseSchema.extend({
  type: z.literal('OIDC'),
  config: oidcConfigSchema,
}).meta({ id: 'OidcIdpConnection' })

export const idpConnectionSchema = z
  .union([samlIdpConnectionSchema, oidcIdpConnectionSchema])
  .meta({ id: 'IdpConnection' })

export type IdpConnectionBase = z.infer<typeof idpConnectionBaseSchema>
export type OIDCConfig = z.infer<typeof oidcConfigSchema>
export type SAMLConfig = z.infer<typeof samlConfigSchema>
export type SamlIdpConnection = z.infer<typeof samlIdpConnectionSchema>
export type OidcIdpConnection = z.infer<typeof oidcIdpConnectionSchema>
export type IdpConnection = z.infer<typeof idpConnectionSchema>
