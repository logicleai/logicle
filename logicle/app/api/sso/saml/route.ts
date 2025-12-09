import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

const tenant = 'app'

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
    ignoreAttributes: false, // we want @attributes
    attributeNamePrefix: '@_', // default
  })

  const json = parser.parse(xml)

  // Google-style metadata usually has md: prefixes, but fast-xml-parser
  // keeps the raw names unless you configure it otherwise:
  const entity = json['md:EntityDescriptor'] ?? json.EntityDescriptor
  if (!entity) {
    return {}
  }

  const idp = entity['md:IDPSSODescriptor'] ?? entity.IDPSSODescriptor
  if (!idp) {
    return {}
  }

  const services = Array.isArray(idp['md:SingleSignOnService'])
    ? idp['md:SingleSignOnService']
    : [idp['md:SingleSignOnService']]

  const ssoRedirect = services.find(
    (s: any) => s['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
  )?.['@_Location']

  const ssoPost = services.find(
    (s: any) => s['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
  )?.['@_Location']

  const keyDescriptors = Array.isArray(idp['md:KeyDescriptor'])
    ? idp['md:KeyDescriptor']
    : [idp['md:KeyDescriptor']].filter(Boolean)

  const signingKey = keyDescriptors.find((k: any) => k['@_use'] === 'signing' || !k['@_use'])

  const certBase64 = signingKey?.['ds:KeyInfo']?.['ds:X509Data']?.['ds:X509Certificate']

  const pemCert = typeof certBase64 === 'string' ? certBase64 : undefined

  return {
    entityId: entity['@_entityID'],
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
  const { name, description, rawMetadata } = await req.json()
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
