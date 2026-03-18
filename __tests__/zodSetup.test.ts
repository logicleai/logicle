import { describe, expect, test } from 'vitest'
import '@/lib/zod/setup'
import { z } from 'zod'

describe('zod custom error messages', () => {
  test('empty required string returns this_field_is_required', () => {
    const schema = z.string().min(1)
    const result = schema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('this_field_is_required')
    }
  })

  test('string shorter than min > 1 returns value_is_too_short', () => {
    const schema = z.string().min(5)
    const result = schema.safeParse('ab')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('value_is_too_short')
    }
  })

  test('invalid email format returns invalid_value_email', () => {
    const schema = z.string().email()
    const result = schema.safeParse('not-an-email')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('invalid_value_email')
    }
  })

  test('z.email() schema returns invalid_value_email for invalid input', () => {
    const schema = z.email()
    const result = schema.safeParse('notvalid')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('invalid_value_email')
    }
  })

  test('valid string passes', () => {
    const schema = z.string().min(1)
    expect(schema.safeParse('hello').success).toBe(true)
  })

  test('valid email passes', () => {
    const schema = z.string().email()
    expect(schema.safeParse('user@example.com').success).toBe(true)
  })
})
