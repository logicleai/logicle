import { describe, expect, test } from 'vitest'
import { getResponseMetadata } from '@/lib/chat/litellm/get-response-metadata'

describe('getResponseMetadata', () => {
  test('maps all fields when present', () => {
    const result = getResponseMetadata({ id: 'abc', model: 'gpt-4o', created: 1700000000 })
    expect(result.id).toBe('abc')
    expect(result.modelId).toBe('gpt-4o')
    expect(result.timestamp).toEqual(new Date(1700000000 * 1000))
  })

  test('converts unix seconds to Date correctly', () => {
    const result = getResponseMetadata({ created: 0 })
    expect(result.timestamp).toEqual(new Date(0))
  })

  test('returns undefined for null/missing fields', () => {
    const result = getResponseMetadata({ id: null, model: null, created: null })
    expect(result.id).toBeUndefined()
    expect(result.modelId).toBeUndefined()
    expect(result.timestamp).toBeUndefined()
  })

  test('returns undefined timestamp when created is undefined', () => {
    const result = getResponseMetadata({})
    expect(result.timestamp).toBeUndefined()
  })
})
