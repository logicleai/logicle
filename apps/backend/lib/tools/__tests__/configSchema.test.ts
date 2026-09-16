import { describe, expect, it, vi } from 'vitest'
import { toolConfigSchema } from '@/backend/lib/tools/configSchema'

const mockBuildOpenApiConfigSchema = vi.fn()

vi.mock('@/backend/lib/tools/openapi/utils', () => ({
  buildOpenApiConfigSchema: (...args: unknown[]) => mockBuildOpenApiConfigSchema(...args),
}))

describe('toolConfigSchema', () => {
  it('extracts the spec from a JSON-encoded string config for the openapi tool', async () => {
    mockBuildOpenApiConfigSchema.mockResolvedValue('schema-for-spec')
    const config = JSON.stringify({ spec: 'openapi: 3.0.0' })

    const result = await toolConfigSchema('openapi', config)

    expect(mockBuildOpenApiConfigSchema).toHaveBeenCalledWith('openapi: 3.0.0')
    expect(result).toBe('schema-for-spec')
  })

  it('extracts the spec from an object config for the openapi tool', async () => {
    mockBuildOpenApiConfigSchema.mockResolvedValue('schema-for-spec')

    await toolConfigSchema('openapi', { spec: 'openapi: 3.0.0' })

    expect(mockBuildOpenApiConfigSchema).toHaveBeenCalledWith('openapi: 3.0.0')
  })

  it('falls back to fallbackConfig when the primary config has no usable spec', async () => {
    mockBuildOpenApiConfigSchema.mockResolvedValue('schema-for-fallback')

    await toolConfigSchema('openapi', undefined, { spec: 'fallback-spec' })

    expect(mockBuildOpenApiConfigSchema).toHaveBeenCalledWith('fallback-spec')
  })

  it('passes undefined when neither config nor fallbackConfig has a usable spec', async () => {
    mockBuildOpenApiConfigSchema.mockResolvedValue('schema-empty')

    await toolConfigSchema('openapi', 'not-json', { unrelated: true })

    expect(mockBuildOpenApiConfigSchema).toHaveBeenCalledWith(undefined)
  })

  it('looks up the schema in the tool schema registry for non-openapi tools', async () => {
    const result = await toolConfigSchema('dummy')
    expect(result).toBeDefined()
  })

  it('returns null for an unknown tool type', async () => {
    const result = await toolConfigSchema('does-not-exist')
    expect(result).toBeNull()
  })
})
