import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { nanoid } from 'nanoid'

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
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const result = dto.insertableSamlConnectionSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const { name, description, rawMetadata } = result.data
  const metadata = parseIdpMetadata(rawMetadata)
  if (!metadata.entityId) {
    throw new Error('No entity id')
  }

  const config: dto.SAMLConfig = {
    entityID: metadata.entityId,
    sso: {
      postUrl: metadata.ssoPost,
      redirectUrl: metadata.ssoRedirect,
    },
    publicKey: metadata.pemCert,
  }
  db.insertInto('IdpConnection')
    .values({
      id: nanoid(),
      name,
      description,
      type: 'SAML' as const,
      config: JSON.stringify(config),
    })
    .execute()
  return ApiResponses.json({})
})
