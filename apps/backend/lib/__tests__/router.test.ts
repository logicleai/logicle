import { describe, expect, it } from 'vitest'
import { normalizeApiPathname } from '@/lib/router'

describe('normalizeApiPathname', () => {
  it('removes trailing slashes before route matching', () => {
    expect(normalizeApiPathname('/api/workspaces/')).toBe('/api/workspaces')
    expect(normalizeApiPathname('/api/workspaces///')).toBe('/api/workspaces')
  })

  it('preserves canonical paths and the root path', () => {
    expect(normalizeApiPathname('/api/workspaces')).toBe('/api/workspaces')
    expect(normalizeApiPathname('/')).toBe('/')
  })
})
