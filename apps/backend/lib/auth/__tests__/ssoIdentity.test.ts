import { describe, expect, it } from 'vitest'
import type { Profile } from '@node-saml/node-saml'
import { findNameInSamlProfile, resolveOidcNameClaim } from '@/backend/lib/auth/ssoIdentity'

const samlProfile = (attrs: Record<string, unknown>) => attrs as unknown as Profile

describe('findNameInSamlProfile', () => {
  it('prefers the friendly displayName attribute', () => {
    expect(findNameInSamlProfile(samlProfile({ displayName: 'Barbara Schivo' }))).toBe(
      'Barbara Schivo'
    )
  })

  it('reads the Microsoft displayname claim URI', () => {
    expect(
      findNameInSamlProfile(
        samlProfile({
          'http://schemas.microsoft.com/identity/claims/displayname': 'Emma Pellegrini',
        })
      )
    ).toBe('Emma Pellegrini')
  })

  it('falls back to givenName + surname claim URIs', () => {
    expect(
      findNameInSamlProfile(
        samlProfile({
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'Sandra',
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Lavalle',
        })
      )
    ).toBe('Sandra Lavalle')
  })

  it('returns null when no usable name claim is present', () => {
    expect(findNameInSamlProfile(samlProfile({ nameID: 'sandra.lavalle@example.com' }))).toBeNull()
  })
})

describe('resolveOidcNameClaim', () => {
  it('prefers the name claim', () => {
    expect(resolveOidcNameClaim({ name: 'Sonia Caderbe', given_name: 'Sonia' })).toBe('Sonia Caderbe')
  })

  it('joins given_name and family_name', () => {
    expect(resolveOidcNameClaim({ given_name: 'Valentina', family_name: 'Cecconi' })).toBe(
      'Valentina Cecconi'
    )
  })

  it('returns null when nothing usable is present', () => {
    expect(resolveOidcNameClaim({})).toBeNull()
  })
})
