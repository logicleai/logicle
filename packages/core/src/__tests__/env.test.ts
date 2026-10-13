import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('CHAT_MAX_TOOL_ITERATIONS', () => {
  const loadLimit = async (value: string | undefined) => {
    vi.stubEnv('CHAT_MAX_TOOL_ITERATIONS', value)
    vi.resetModules()
    return (await import('../env')).default.chat.maxToolIterations
  }

  it('defaults to 30 when not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadLimit(undefined)).toBe(30)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['1', '2', '10', '60'])('accepts %s rounds', async (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadLimit(value)).toBe(Number(value))
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['', ' ', '0', '-1', '1.5', 'abc', '10abc', 'NaN', 'Infinity', '9007199254740992'])(
    'warns and defaults to 30 for invalid configuration %j',
    async (value) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await loadLimit(value)).toBe(30)
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        'CHAT_MAX_TOOL_ITERATIONS must be a positive integer; using default 30'
      )
    }
  )
})
