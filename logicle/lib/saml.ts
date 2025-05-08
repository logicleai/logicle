// lib/saml.ts
import { ServiceProvider, IdentityProvider } from 'saml2-js'
import fs from 'fs'
import path from 'path'
import env from './env'
import { db } from '@/db/database'

export const serviceProvider = new ServiceProvider({
  entity_id: env.appUrl,
  private_key: fs.readFileSync(path.join(process.cwd(), 'certs/key.pem')).toString(),
  certificate: fs.readFileSync(path.join(process.cwd(), 'certs/public.crt')).toString(),
  assert_endpoint: `${env.appUrl}/api/oauth/saml`,
  allow_unencrypted_assertion: true,
})

export const findSamlIdentityProvider = async (clientId: string) => {
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
      const { sso, publicKey } = entry.idpMetadata
      const { postUrl } = sso
      return new IdentityProvider({
        sso_login_url: postUrl,
        sso_logout_url: postUrl,
        certificates: publicKey,
      })
    })
    .find(() => true)
  return identityProvider!!
}
