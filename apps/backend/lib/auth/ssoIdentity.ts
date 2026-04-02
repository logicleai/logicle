import type { Profile } from '@node-saml/node-saml'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmailClaim(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized || !EMAIL_PATTERN.test(normalized)) {
    return null
  }

  return normalized
}

export function resolveOidcEmailClaim(claims: { email?: unknown; sub?: unknown }): string | null {
  const resolved = `${claims.email ?? claims.sub ?? ''}`.trim().toLowerCase()
  return resolved || null
}

function normalizeClaim(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  return normalized || null
}

export function findEmailInSamlProfile(profile: Profile): string | null {
  return (
    // Match the old BoxyHQ/Jackson outcome as closely as possible:
    // prefer explicit email attributes, and only fall back to NameID
    // when the assertion does not expose a dedicated email claim.
    normalizeEmailClaim((profile as any).mail) ||
    normalizeEmailClaim((profile as any).email) ||
    // Microsoft / ADFS-style email claim URI.
    normalizeEmailClaim(
      (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
    ) ||
    // Last resort for tenants that only release NameID.
    normalizeClaim((profile as any).nameID)
  )
}
