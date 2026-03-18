import { test, expect } from 'vitest'
import crypto from 'node:crypto'
import { createPkcePair } from '@/lib/tools/mcp/oauth'

const base64UrlEncode = (input: Buffer) => input.toString('base64url').replace(/=+$/g, '')

test('createPkcePair generates S256 challenge', () => {
  const { codeVerifier, codeChallenge } = createPkcePair()
  expect(codeVerifier.length).toBeGreaterThan(30)
  const digest = crypto.createHash('sha256').update(codeVerifier).digest()
  const expected = base64UrlEncode(digest)
  expect(codeChallenge).toBe(expected)
})
