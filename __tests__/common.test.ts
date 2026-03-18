import { describe, expect, test } from 'vitest'
import { slugify, extractAuthToken, createRandomString } from '@/lib/common'
import type { NextApiRequest } from 'next'

describe('slugify', () => {
  test('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  test('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })

  test('collapses multiple spaces/hyphens', () => {
    expect(slugify('foo   bar')).toBe('foo-bar')
    expect(slugify('foo---bar')).toBe('foo-bar')
  })

  test('trims leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
    expect(slugify('!hello!')).toBe('hello')
  })

  test('handles already-slugified input unchanged', () => {
    expect(slugify('my-slug-123')).toBe('my-slug-123')
  })

  test('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  test('handles only special characters', () => {
    expect(slugify('!@#$%')).toBe('')
  })

  test('preserves numbers', () => {
    expect(slugify('Version 2.0')).toBe('version-20')
  })
})

describe('createRandomString', () => {
  test('default length is 6', () => {
    expect(createRandomString()).toHaveLength(6)
  })

  test('returns string of specified length', () => {
    expect(createRandomString(10)).toHaveLength(10)
    expect(createRandomString(1)).toHaveLength(1)
  })

  test('returns only alphabetic characters', () => {
    const result = createRandomString(100)
    expect(result).toMatch(/^[A-Za-z]+$/)
  })

  test('two calls return different strings (with high probability)', () => {
    // 52^6 ≈ 20 billion combinations — collision is virtually impossible
    expect(createRandomString()).not.toBe(createRandomString())
  })
})

describe('extractAuthToken', () => {
  const req = (authorization: string | undefined) =>
    ({ headers: { authorization } }) as unknown as NextApiRequest

  test('extracts Bearer token from header', () => {
    expect(extractAuthToken(req('Bearer my-token'))).toBe('my-token')
  })

  test('returns null when header is absent', () => {
    expect(extractAuthToken(req(undefined))).toBeNull()
  })

  test('returns undefined (second split part) when no space in header', () => {
    // split(' ')[1] returns undefined — matches current behaviour
    expect(extractAuthToken(req('NoSpace'))).toBeUndefined()
  })
})
