import { describe, expect, it } from 'vitest'
import { buildOpenApiConfigSchema } from '@/backend/lib/tools/openapi/utils'

const baseDoc = {
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/ping': {
      get: {
        responses: { '200': { description: 'ok' } },
      },
    },
  },
}

const specWithApiKey = JSON.stringify({
  ...baseDoc,
  components: {
    securitySchemes: {
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      basicAuth: { type: 'http', scheme: 'basic' },
      oauth: { type: 'oauth2', flows: {} },
    },
  },
})

const specWithoutSecurity = JSON.stringify(baseDoc)

describe('buildOpenApiConfigSchema', () => {
  it('returns a passthrough base schema when no spec is provided', async () => {
    const schema = await buildOpenApiConfigSchema(undefined)
    const parsed = schema.parse({ spec: 'anything', extra: 'kept' })
    expect(parsed).toEqual({ spec: 'anything', extra: 'kept' })
  })

  it('falls back to the base schema when the spec is not valid YAML/JSON', async () => {
    const schema = await buildOpenApiConfigSchema('{ not: valid: yaml: [')
    const parsed = schema.parse({ spec: 'x' })
    expect(parsed).toEqual({ spec: 'x' })
  })

  it('falls back to the base schema when the document has no apiKey/http security schemes', async () => {
    const schema = await buildOpenApiConfigSchema(specWithoutSecurity)
    // Base schema only ever declares "spec"; no per-scheme secret fields were added.
    expect(Object.keys((schema as any).shape)).toEqual(['spec'])
  })

  it('extends the schema with declared secret fields for apiKey and http security schemes only', async () => {
    const schema = await buildOpenApiConfigSchema(specWithApiKey)

    const parsed = schema.parse({ spec: specWithApiKey, apiKeyAuth: 'secret-value' })
    expect(parsed.apiKeyAuth).toBe('secret-value')

    // oauth2 is not an apiKey/http scheme, so it must not become a declared secret field.
    expect((schema as any).shape.oauth).toBeUndefined()
    expect((schema as any).shape.apiKeyAuth).toBeDefined()
    expect((schema as any).shape.basicAuth).toBeDefined()
  })

  it('treats secret fields as optional', async () => {
    const schema = await buildOpenApiConfigSchema(specWithApiKey)
    expect(() => schema.parse({ spec: specWithApiKey })).not.toThrow()
  })
})
