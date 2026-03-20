import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const originalProvisionModelsPath = process.env.PROVISION_MODELS_PATH
const originalApiKey = process.env.API_KEY

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  process.env.PROVISION_MODELS_PATH = originalProvisionModelsPath
  process.env.API_KEY = originalApiKey
  vi.unmock('@/models/user')
  vi.unmock('@/lib/env')
  vi.unmock('@/models/properties')
  vi.unmock('@/models/toolSecrets')
  vi.doUnmock('@/models/user')
  vi.doUnmock('@/lib/env')
  vi.doUnmock('@/models/properties')
  vi.doUnmock('@/models/toolSecrets')
})

describe('apps/backend/lib/parameters', () => {
  test('throws when the user does not exist', async () => {
    vi.doMock('@/models/user', () => ({
      getUserById: vi.fn().mockResolvedValue(null),
      getUserParameterValuesAsNameRecord: vi.fn(),
    }))
    vi.doMock('@/lib/env', () => ({
      default: { appUrl: 'https://tenant.example.com' },
    }))

    const { getUserParameters } = await import('@/backend/lib/parameters')

    await expect(getUserParameters('missing-user')).rejects.toThrow('No such user: missing-user')
  })

  test('merges stored parameters with built-in user values', async () => {
    vi.doMock('@/models/user', () => ({
      getUserById: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
      getUserParameterValuesAsNameRecord: vi.fn().mockResolvedValue({
        FAVORITE_COLOR: {
          value: 'blue',
          description: 'favorite color',
          defaultValue: 'green',
        },
      }),
    }))
    vi.doMock('@/lib/env', () => ({
      default: { appUrl: 'https://tenant.example.com' },
    }))

    const { getUserParameters } = await import('@/backend/lib/parameters')

    await expect(getUserParameters('user-1')).resolves.toEqual({
      FAVORITE_COLOR: {
        value: 'blue',
        description: 'favorite color',
        defaultValue: 'green',
      },
      USER_NAME: {
        value: 'Ada Lovelace',
        description: 'USER_NAME',
        defaultValue: null,
      },
      USER_EMAIL: {
        value: 'ada@example.com',
        description: 'USER_EMAIL',
        defaultValue: null,
      },
      TENANT_URL: {
        value: 'https://tenant.example.com',
        description: 'TENANT_URL',
        defaultValue: null,
      },
    })
  })
})

describe('apps/backend/lib/properties', () => {
  test('getBool returns parsed booleans and falls back to defaults', async () => {
    const getPropertyByName = vi
      .fn()
      .mockResolvedValueOnce({ value: 'true' })
      .mockResolvedValueOnce({ value: 'true' })
      .mockResolvedValueOnce({ value: 'false' })
      .mockResolvedValueOnce({ value: 'unexpected' })

    vi.doMock('@/models/properties', () => ({
      getPropertyByName,
    }))

    const { PropertySource } = await import('@/backend/lib/properties')
    const { AppSettingsDefaults } = await import('@/types/settings')

    await expect(PropertySource.getBool('enable_signup')).resolves.toBe(true)
    await expect(PropertySource.signupEnabled()).resolves.toBe(true)
    await expect(PropertySource.getBool('enable_signup')).resolves.toBe(false)
    await expect(PropertySource.getBool('enable_signup')).resolves.toBe(
      AppSettingsDefaults.enable_signup
    )
  })
})

describe('apps/backend/lib/templates', () => {
  test('expandEnv substitutes defined variables and blanks missing ones', async () => {
    process.env.API_KEY = 'secret-value'

    const { expandEnv } = await import('@/backend/lib/templates')

    expect(expandEnv('token=${API_KEY};missing=${NOT_DEFINED}')).toBe(
      'token=secret-value;missing='
    )
  })

  test('resolveToolSecretReference returns literal values when not using secret syntax', async () => {
    const { resolveToolSecretReference } = await import('@/backend/lib/templates')

    await expect(resolveToolSecretReference('tool-1', 'plain-text')).resolves.toBe('plain-text')
  })

  test('resolveToolSecretReference resolves stored secrets and preserves unresolved references', async () => {
    const getToolSecretValue = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', value: 'resolved-secret' })
      .mockResolvedValueOnce({ status: 'missing' })

    vi.doMock('@/models/toolSecrets', () => ({
      getToolSecretValue,
    }))

    const { resolveToolSecretReference } = await import('@/backend/lib/templates')

    await expect(resolveToolSecretReference('tool-1', '${secret.api-key}')).resolves.toBe(
      'resolved-secret'
    )
    await expect(resolveToolSecretReference('tool-1', '${secret.api-key}')).resolves.toBe(
      '${secret.api-key}'
    )
    expect(getToolSecretValue).toHaveBeenNthCalledWith(1, 'tool-1', 'api-key')
    expect(getToolSecretValue).toHaveBeenNthCalledWith(2, 'tool-1', 'api-key')
  })
})

describe('apps/backend/lib/models', () => {
  test('loads provisioned models from disk and normalizes tokenizer/pdf defaults', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logicle-models-'))
    process.env.PROVISION_MODELS_PATH = tempDir

    await fs.writeFile(
      path.join(tempDir, 'anthropic.json'),
      JSON.stringify([
        {
          id: 'anthropic-pdf',
          model: 'claude-pdf',
          name: 'Claude PDF',
          provider: 'anthropic',
          owned_by: 'anthropic',
          description: 'Anthropic model with PDF support',
          context_length: 200000,
          capabilities: {
            vision: true,
            function_calling: true,
            reasoning: true,
            supportedMedia: ['application/pdf'],
          },
        },
      ])
    )
    await fs.writeFile(
      path.join(tempDir, 'openai.json'),
      JSON.stringify([
        {
          id: 'openai-custom',
          model: 'gpt-custom',
          name: 'GPT Custom',
          provider: 'openai',
          owned_by: 'openai',
          description: 'Custom OpenAI model',
          context_length: 128000,
          capabilities: {
            vision: true,
            function_calling: true,
            reasoning: true,
          },
          tokenizer: 'o200k_base',
        },
      ])
    )

    const { llmModels } = await import('@/backend/lib/models')

    expect(llmModels).toHaveLength(2)
    expect(llmModels[0]).toMatchObject({
      id: 'anthropic-pdf',
      tokenizer: 'approx_4chars',
      capabilities: {
        nativePdfPageLimit: 100,
        supportedMedia: ['application/pdf'],
      },
    })
    expect(llmModels[1]).toMatchObject({
      id: 'openai-custom',
      tokenizer: 'o200k_base',
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('ignores invalid model fragments instead of failing the whole load', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logicle-models-invalid-'))
    process.env.PROVISION_MODELS_PATH = tempDir

    await fs.writeFile(path.join(tempDir, 'broken.json'), '{not-valid-json')
    await fs.writeFile(
      path.join(tempDir, 'valid.json'),
      JSON.stringify([
        {
          id: 'valid-model',
          model: 'valid-model',
          name: 'Valid Model',
          provider: 'gemini',
          owned_by: 'gemini',
          description: 'Still loads when another fragment is broken',
          context_length: 32000,
          capabilities: {
            vision: false,
            function_calling: true,
            reasoning: false,
          },
        },
      ])
    )

    const { llmModels } = await import('@/backend/lib/models')

    expect(llmModels).toHaveLength(1)
    expect(llmModels[0]).toMatchObject({
      id: 'valid-model',
      tokenizer: 'approx_4chars',
    })

    await fs.rm(tempDir, { recursive: true, force: true })
  })
})

describe('packages/core runtime helpers', () => {
  test('toolSchemaRegistry maps well-known tool names to working schemas', async () => {
    const { toolSchemaRegistry } = await import('@/lib/tools/registry')

    expect(Object.keys(toolSchemaRegistry)).toEqual(
      expect.arrayContaining([
        'dummy',
        'mcp',
        'router',
        'openai.code_interpreter',
        'openai.image_generation',
        'anthropic.web_search',
      ])
    )

    expect(toolSchemaRegistry.mcp.schema.parse({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
      authentication: { type: 'none' },
    })
    expect(
      toolSchemaRegistry['openai.code_interpreter'].schema.parse({
        executionMode: {
          apiKey: 'secret',
        },
      })
    ).toEqual({
      executionMode: {
        mode: 'tool',
        apiKey: 'secret',
      },
    })
  })

  test('sharing helpers identify all-sharing and matching workspaces', async () => {
    const { isAllSharingType, isSharedWithAllOrAnyWorkspace } = await import(
      '@/types/dto/sharing'
    )

    expect(isAllSharingType({ type: 'all' })).toBe(true)
    expect(isAllSharingType({ type: 'workspace', workspaceId: 'w-1', workspaceName: 'Main' })).toBe(
      false
    )
    expect(
      isSharedWithAllOrAnyWorkspace(
        [
          { type: 'workspace', workspaceId: 'w-2', workspaceName: 'Secondary' },
          { type: 'all' },
        ],
        ['w-1']
      )
    ).toEqual({ type: 'all' })
    expect(
      isSharedWithAllOrAnyWorkspace(
        [{ type: 'workspace', workspaceId: 'w-2', workspaceName: 'Secondary' }],
        ['w-2']
      )
    ).toEqual({ type: 'workspace', workspaceId: 'w-2', workspaceName: 'Secondary' })
    expect(
      isSharedWithAllOrAnyWorkspace(
        [{ type: 'workspace', workspaceId: 'w-2', workspaceName: 'Secondary' }],
        ['w-3']
      )
    ).toBeUndefined()
  })

  test('llmModelSchema accepts valid shapes and rejects invalid tokenizer values', async () => {
    const { llmModelSchema } = await import('@/types/dto/llmmodel')

    expect(
      llmModelSchema.parse({
        id: 'gpt-1',
        model: 'gpt-1',
        name: 'GPT 1',
        provider: 'openai',
        owned_by: 'openai',
        description: 'Example model',
        context_length: 8192,
        capabilities: {
          vision: true,
          function_calling: true,
          reasoning: false,
          supportedMedia: ['image/png'],
        },
        defaultReasoning: null,
        tags: ['latest'],
        maxOutputTokens: 2048,
        tokenizer: 'cl100k_base',
      })
    ).toMatchObject({
      id: 'gpt-1',
      tokenizer: 'cl100k_base',
    })

    expect(() =>
      llmModelSchema.parse({
        id: 'bad-model',
        model: 'bad-model',
        name: 'Bad Model',
        provider: 'openai',
        owned_by: 'openai',
        description: 'Bad tokenizer',
        context_length: 1024,
        capabilities: {
          vision: false,
          function_calling: false,
          reasoning: false,
        },
        tokenizer: 'invalid_tokenizer',
      })
    ).toThrow()
  })
})
