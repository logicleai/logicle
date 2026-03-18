import { describe, expect, test } from 'vitest'
import { mapLitellmFinishReason } from '@/lib/chat/litellm/map-litellm-finish-reason'

describe('mapLitellmFinishReason', () => {
  test.each([
    ['stop', 'stop'],
    ['length', 'length'],
    ['content_filter', 'content-filter'],
    ['function_call', 'tool-calls'],
    ['tool_calls', 'tool-calls'],
  ])('%s maps to %s', (input, expected) => {
    expect(mapLitellmFinishReason(input)).toBe(expected)
  })

  test('unknown string maps to unknown', () => {
    expect(mapLitellmFinishReason('something_else')).toBe('unknown')
  })

  test('null maps to unknown', () => {
    expect(mapLitellmFinishReason(null)).toBe('unknown')
  })

  test('undefined maps to unknown', () => {
    expect(mapLitellmFinishReason(undefined)).toBe('unknown')
  })
})
