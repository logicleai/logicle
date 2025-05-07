// lib/saml.ts
import { ServiceProvider, IdentityProvider } from 'saml2-js'
import fs from 'fs'
import path from 'path'

const baseUrl = process.env.NEXTAUTH_URL! // e.g. "https://your-app.com"

export const serviceProvider = new ServiceProvider({
  entity_id: `https://andrai.foosoft.it`,
  private_key: fs.readFileSync(path.join(process.cwd(), 'certs/key.pem')).toString(),
  certificate: fs.readFileSync(path.join(process.cwd(), 'certs/public.crt')).toString(),
  assert_endpoint: `${baseUrl}/login/saml`,
  allow_unencrypted_assertion: true,
})

export const identityProvider = new IdentityProvider({
  sso_login_url: 'https://accounts.google.com/o/saml2/idp?idpid=C028laf2i',
  sso_logout_url: 'https://accounts.google.com/o/saml2/idp?idpid=C028laf2i',
  certificates:
    'MIIDdDCCAlygAwIBAgIGAYFHxJtfMA0GCSqGSIb3DQEBCwUAMHsxFDASBgNVBAoTC0dvb2dsZSBJ bmMuMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MQ8wDQYDVQQDEwZHb29nbGUxGDAWBgNVBAsTD0dv b2dsZSBGb3IgV29yazELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWEwHhcNMjIwNjA5 MDkyMTE1WhcNMjcwNjA4MDkyMTE1WjB7MRQwEgYDVQQKEwtHb29nbGUgSW5jLjEWMBQGA1UEBxMN TW91bnRhaW4gVmlldzEPMA0GA1UEAxMGR29vZ2xlMRgwFgYDVQQLEw9Hb29nbGUgRm9yIFdvcmsx CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A MIIBCgKCAQEAqWxzVA+9CVMKVCCF7qvn3aQo3RriKFDZs4zjrv2HpyO7WDdPB3pHzv3tgT8aaxh0 qVX7Bb5TL2jXrGWuQp1/beyBO3VEHy1ePLV+heQ9d+Xjdm7jLY62qg6ZL12YPi7JXX5Ok7HN+vRr Y3zqgnpjEgvJ3zjI/n9F1YUvm7LUzkTGrN6m/HQEY2fVO4gU7ZHaGyPht7L9HhxgrIESbBIsQsMt tX+tRIMUPjt7sIiC4lfVzlVqdw2ox7JOirunDdHLOF0aZJqqEHV954IM4IF/iiyE7YXTZbdwfT1u pYsQf57Ks9bf5etEvzTCBo0IeQqOOKB/dfi4z53TGhPI4pKX2wIDAQABMA0GCSqGSIb3DQEBCwUA A4IBAQBmICjKsmAFGjd5noOcGF0PULOTm//XG6UTj3VTVxwao7AKV6+gM/cAPQAjCqcidlnlZRfY QNwqC46BOONWowQnS9bAYRVB+g+jUaHL4ZaWV/Upca1YxT0sBtxiOTsZJG+rEcVYQOXH9xEnpL/U CRWEANYjIIMeYlkF7fX+ReCndl4haxJVsGdsl3j5MjH0H6V5tUxB8INw3lRh0mXC236PzL/s0zSX saE8OmhZl8OdiXsxiVVIilTel92dYFXER+uYAXTlgZjXIL5v9oHjzu8aMzlwLPouIe4XcRzOCVIb wDiiJs6f/RTk/RxK3VnzO7bolH0OAEImpLG6a8gki4AK',
})
