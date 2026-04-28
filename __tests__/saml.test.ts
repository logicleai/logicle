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

  test('prioritizes email over nameID when both are present', () => {
    expect(
      findEmailInSamlProfile({ nameID: 'nid@b.com', email: 'em@b.com' } as unknown as Profile)
    ).toBe('em@b.com')
  })

  test('ignores a non-email nameID when an email attribute is present', () => {
    expect(
      findEmailInSamlProfile({ nameID: 'employee-123', email: 'em@b.com' } as unknown as Profile)
    ).toBe('em@b.com')
  })

  test('falls back to non-email nameID when no email attribute exists', () => {
    expect(findEmailInSamlProfile({ nameID: 'employee-123' } as unknown as Profile)).toBe(
      'employee-123'
    )
  })
})
