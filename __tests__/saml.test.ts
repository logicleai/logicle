import { describe, expect, test } from 'vitest'
import { findEmailInSamlProfile } from '@/lib/auth/saml'
import type { Profile } from '@node-saml/node-saml'

describe('findEmailInSamlProfile', () => {
  test('returns mail field when present', () => {
    expect(findEmailInSamlProfile({ mail: 'a@b.com' } as unknown as Profile)).toBe('a@b.com')
  })

  test('falls back to nameID', () => {
    expect(findEmailInSamlProfile({ nameID: 'user@example.com' } as unknown as Profile)).toBe(
      'user@example.com'
    )
  })

  test('falls back to email field', () => {
    expect(findEmailInSamlProfile({ email: 'c@d.com' } as unknown as Profile)).toBe('c@d.com')
  })

  test('falls back to SAML claims email', () => {
    expect(
      findEmailInSamlProfile({
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'x@y.com',
      } as unknown as Profile)
    ).toBe('x@y.com')
  })

  test('prioritizes mail over nameID', () => {
    expect(
      findEmailInSamlProfile({ mail: 'first@b.com', nameID: 'second@b.com' } as unknown as Profile)
    ).toBe('first@b.com')
  })

  test('prioritizes nameID over email', () => {
    expect(
      findEmailInSamlProfile({ nameID: 'nid@b.com', email: 'em@b.com' } as unknown as Profile)
    ).toBe('nid@b.com')
  })
})
