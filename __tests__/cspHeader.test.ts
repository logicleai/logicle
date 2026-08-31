import { afterEach, describe, expect, test } from 'vitest'
import { applyCspHeaders, CSP_DIRECTIVES } from '@/backend/lib/staticFrontendVite'

const ENV_KEYS = ['CSP_DISABLE', 'CSP_REPORT_ONLY'] as const

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('SPA shell Content-Security-Policy', () => {
  test('locks down the framing / script / object surface', () => {
    expect(CSP_DIRECTIVES).toContain("default-src 'self'")
    expect(CSP_DIRECTIVES).toContain("base-uri 'self'")
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'")
    expect(CSP_DIRECTIVES).toContain("frame-src 'none'")
    expect(CSP_DIRECTIVES).toContain("object-src 'none'")
    // no 'unsafe-eval' — Zod's allowsEval probe is guarded and falls back
    expect(CSP_DIRECTIVES).toContain("script-src 'self'")
    expect(CSP_DIRECTIVES).not.toContain('unsafe-eval')
  })

  test('enforces by default', () => {
    const h: Record<string, string> = {}
    applyCspHeaders(h)
    expect(h['Content-Security-Policy']).toBe(CSP_DIRECTIVES)
    expect(h['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  test('CSP_REPORT_ONLY=1 observes without enforcing', () => {
    process.env.CSP_REPORT_ONLY = '1'
    const h: Record<string, string> = {}
    applyCspHeaders(h)
    expect(h['Content-Security-Policy']).toBeUndefined()
    expect(h['Content-Security-Policy-Report-Only']).toBe(CSP_DIRECTIVES)
  })

  test('CSP_DISABLE=1 emits nothing', () => {
    process.env.CSP_DISABLE = '1'
    const h: Record<string, string> = {}
    applyCspHeaders(h)
    expect(Object.keys(h)).toHaveLength(0)
  })
})
