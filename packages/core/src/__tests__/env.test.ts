import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('CHAT_MAX_TOOL_ITERATIONS', () => {
  const loadLimit = async (value: string | undefined) => {
    vi.stubEnv('CHAT_MAX_TOOL_ITERATIONS', value)
    vi.resetModules()
    return (await import('../env')).default.chat.maxToolIterations
  }

  it('defaults to 30 when not configured', async () => {
    expect(await loadLimit(undefined)).toBe(30)
  })

  it.each(['1', '2', '10', '60'])('accepts %s rounds', async (value) => {
    expect(await loadLimit(value)).toBe(Number(value))
  })

  it.each(['', ' ', '0', '-1', '1.5', 'abc', '10abc', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid configuration %j',
    async (value) => {
      await expect(loadLimit(value)).rejects.toThrow(
        'CHAT_MAX_TOOL_ITERATIONS must be a positive integer'
      )
    }
  )
})
