import env from '@/lib/env'
import { error, forbidden, ok, operation, responseSpec, route } from '@/lib/routes'
import { nanoid } from 'nanoid'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

import { XMLParser } from 'fast-xml-parser'
import { db } from '@/db/database'
import * as dto from '@/types/dto'

type ParsedIdpMetadata = {
  entityId?: string
  ssoRedirect?: string
  ssoPost?: string
  pemCert?: string
}

export function parseIdpMetadata(xml: string): ParsedIdpMetadata {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  })

  const json = parser.parse(xml)

  // Root <EntityDescriptor ...>
  const entity = json.EntityDescriptor
  if (!entity) {
    return {}
  }

  // <IDPSSODescriptor ...> (can technically be an array, take first if so)
  const idpRaw = entity.IDPSSODescriptor
  const idp = Array.isArray(idpRaw) ? idpRaw[0] : idpRaw
  if (!idp) {
    return {}
  }

  // ---- SingleSignOnService (redirect/post) ----

  const ssoRaw = idp.SingleSignOnService
  const services: any[] = ssoRaw == null ? [] : Array.isArray(ssoRaw) ? ssoRaw : [ssoRaw]

  const ssoRedirect = services.find(
    (s) => s?.['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
  )?.['@_Location']

  const ssoPost = services.find(
    (s) => s?.['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
  )?.['@_Location']

  // ---- Signing certificate ----

  const kdRaw = idp.KeyDescriptor
  const keyDescriptors: any[] = kdRaw == null ? [] : Array.isArray(kdRaw) ? kdRaw : [kdRaw]

  const signingKey = keyDescriptors.find((k) => !k?.['@_use'] || k['@_use'] === 'signing')

  const keyInfo = signingKey?.KeyInfo
  const x509Data = keyInfo?.X509Data

  // Can be string or array (some metadata has multiple certs)
  const certNode = Array.isArray(x509Data?.X509Certificate)
    ? x509Data.X509Certificate[0]
    : x509Data?.X509Certificate

  const pemCert =
    typeof certNode === 'string'
      ? certNode.replace(/\s+/g, '') // normalize whitespace
      : undefined

  const entityId = entity['@_entityID']

  return {
    entityId,
    ssoRedirect,
    ssoPost,
    pemCert,
  }
}

// Create a SAML connection.
export const { POST } = route({
  POST: operation({
    name: 'Create SAML SSO connection',
    description: 'Create a new SAML identity provider connection.',
    authentication: 'admin',
    requestBodySchema: dto.insertableSamlConnectionSchema,
    responses: [responseSpec(200, z.object({})), responseSpec(403), responseSpec(400)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      if (env.sso.locked) {
        return forbidden('sso_locked')
      }
      const { name, description, rawMetadata } = requestBody
      const metadata = parseIdpMetadata(rawMetadata)
      if (!metadata.entityId) {
        return error(400, 'No entity id')
      }

      const config: dto.SAMLConfig = {
        entityID: metadata.entityId,
        sso: {
          postUrl: metadata.ssoPost,
          redirectUrl: metadata.ssoRedirect,
        },
        publicKey: metadata.pemCert,
      }
      await db
        .insertInto('IdpConnection')
        .values({
          id: nanoid(),
          name,
          description,
          type: 'SAML' as const,
          config: JSON.stringify(config),
        })
        .execute()
      return ok({})
    },
  }),
})
