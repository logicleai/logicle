import { describe, expect, test } from 'vitest'
import { generateRandomString } from '@/lib/codeblock'

const ALLOWED_CHARS = new Set('ABCDEFGHJKLMNPQRSTUVWXY3456789'.split(''))
const EXCLUDED_CHARS = new Set('ZI102O'.split(''))

describe('generateRandomString', () => {
  test('returns a string of the requested length', () => {
    expect(generateRandomString(10)).toHaveLength(10)
    expect(generateRandomString(1)).toHaveLength(1)
    expect(generateRandomString(0)).toHaveLength(0)
  })

  test('uses only the allowed character set', () => {
    const result = generateRandomString(200)
    for (const char of result) {
      expect(ALLOWED_CHARS.has(char), `unexpected char: ${char}`).toBe(true)
    }
  })

  test('never includes excluded look-alike characters', () => {
    const result = generateRandomString(500)
    for (const char of result) {
      expect(EXCLUDED_CHARS.has(char), `excluded char found: ${char}`).toBe(false)
    }
  })

  test('returns uppercase by default', () => {
    const result = generateRandomString(100)
    expect(result).toBe(result.toUpperCase())
  })

  test('returns lowercase when flag is set', () => {
    const result = generateRandomString(100, true)
    expect(result).toBe(result.toLowerCase())
  })
})
