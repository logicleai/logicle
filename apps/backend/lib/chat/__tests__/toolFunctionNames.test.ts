import { describe, expect, it } from 'vitest'
import {
  prefixedToolFunctionName,
  prefixToolFunctionNames,
} from '@/backend/lib/chat/toolFunctionNames'

const functionDefinition = {
  description: '',
  invoke: async () => ({ type: 'text', value: '' }),
} as any

describe('tool function names', () => {
  it('uses sanitized tool and function name segments joined by __', () => {
    expect(prefixedToolFunctionName('MCP Files (EU)', 'read file')).toBe('MCP_Files_EU__read_file')
  })

  it('keeps generated names provider-safe and within the OpenAI function name limit', () => {
    const name = prefixedToolFunctionName('a'.repeat(80), 'read file')

    expect(name.length).toBeLessThanOrEqual(64)
    expect(name).toMatch(/^[A-Za-z0-9_-]+$/)
    // long tool segment is truncated with a hash; function segment follows after __
    expect(name).toMatch(/_[0-9a-f]{8}__read_file$/)
  })

  it('adds a hash suffix when sanitization creates collisions', () => {
    const functions = prefixToolFunctionNames(
      {
        'read file': functionDefinition,
        'read@file': functionDefinition,
      },
      'Tool!',
      new Set()
    )

    const names = Object.keys(functions)
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
    expect(names[0]).toBe('Tool__read_file')
    expect(names[1]).toMatch(/^Tool__read_file_[0-9a-f]{8}$/)
  })

  it('leaves provider-native tool names unchanged', () => {
    const functions = prefixToolFunctionNames(
      {
        web_search: {
          type: 'provider',
          id: 'openai.web_search',
          args: {},
        },
      },
      'OpenAI Search',
      new Set()
    )

    expect(Object.keys(functions)).toEqual(['web_search'])
  })
})
