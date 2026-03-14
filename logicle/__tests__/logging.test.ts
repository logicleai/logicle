import { describe, expect, test } from 'vitest'
import { sanitizeAndTransform, smartStringify } from '@/lib/logging'

describe('sanitizeAndTransform', () => {
  test('passes through short strings unchanged', () => {
    expect(sanitizeAndTransform('hello')).toBe('hello')
  })

  test('truncates strings exceeding maxStringLength', () => {
    const long = 'a'.repeat(100)
    expect(sanitizeAndTransform(long, 10)).toBe('a'.repeat(10))
  })

  test('leaves strings within maxStringLength intact', () => {
    expect(sanitizeAndTransform('hi', 50)).toBe('hi')
  })

  test('converts Buffer to base64 string', () => {
    const buf = Buffer.from('abc')
    expect(sanitizeAndTransform(buf)).toBe(buf.toString('base64'))
  })

  test('converts ArrayBuffer to base64 string', () => {
    const arr = new TextEncoder().encode('hello').buffer as ArrayBuffer
    const result = sanitizeAndTransform(arr)
    expect(typeof result).toBe('string')
    expect(result).toBe(Buffer.from(arr).toString('base64'))
  })

  test('converts Uint8Array to base64 string', () => {
    const u8 = new Uint8Array([1, 2, 3])
    const result = sanitizeAndTransform(u8)
    expect(typeof result).toBe('string')
  })

  test('recurses into arrays', () => {
    const result = sanitizeAndTransform(['hello', 'world'], 50) as string[]
    expect(result).toEqual(['hello', 'world'])
  })

  test('truncates strings inside arrays', () => {
    const result = sanitizeAndTransform(['a'.repeat(20)], 5) as string[]
    expect(result[0]).toBe('aaaaa')
  })

  test('recurses into plain objects', () => {
    const result = sanitizeAndTransform({ key: 'value' }) as Record<string, unknown>
    expect(result['key']).toBe('value')
  })

  test('truncates strings inside objects', () => {
    const result = sanitizeAndTransform({ msg: 'x'.repeat(100) }, 3) as Record<string, unknown>
    expect(result['msg']).toBe('xxx')
  })

  test('passes through null', () => {
    expect(sanitizeAndTransform(null)).toBeNull()
  })

  test('passes through numbers', () => {
    expect(sanitizeAndTransform(42)).toBe(42)
  })

  test('passes through booleans', () => {
    expect(sanitizeAndTransform(true)).toBe(true)
  })

  test('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj['self'] = obj
    const result = sanitizeAndTransform(obj) as Record<string, unknown>
    expect(result['a']).toBe(1)
    expect(result['self']).toBeUndefined()
  })

  test('handles deeply nested objects', () => {
    const result = sanitizeAndTransform({ a: { b: { c: 'deep' } } }) as Record<string, unknown>
    expect((result['a'] as Record<string, unknown>)['b']).toEqual({ c: 'deep' })
  })
})

describe('smartStringify', () => {
  test('stringifies a simple object', () => {
    expect(smartStringify({ key: 'value' })).toBe('{"key":"value"}')
  })

  test('truncates long strings within objects', () => {
    const result = JSON.parse(smartStringify({ msg: 'a'.repeat(100) }, 5))
    expect(result.msg).toBe('aaaaa')
  })

  test('stringifies numbers', () => {
    expect(smartStringify(42)).toBe('42')
  })

  test('stringifies booleans', () => {
    expect(smartStringify(true)).toBe('true')
  })

  test('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj['self'] = obj
    const result = JSON.parse(smartStringify(obj))
    expect(result.a).toBe(1)
    expect(result.self).toBeUndefined()
  })

  test('serializes Buffer values as JSON-serializable representation', () => {
    const buf = Buffer.from('test')
    // JSON.stringify calls toJSON() on Buffer before the replacer sees it,
    // so it arrives as { type: 'Buffer', data: [...] } — still serializable
    const result = JSON.parse(smartStringify({ buf }))
    expect(result.buf).toBeDefined()
  })
})
