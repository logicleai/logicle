import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockCreateOpenAI,
  mockCreateAnthropic,
  mockCreateGoogleGenerativeAI,
  mockCreateLitellm,
  mockCreateVertex,
  mockCreatePerplexity,
} = vi.hoisted(() => ({
  mockCreateOpenAI: vi.fn(),
  mockCreateAnthropic: vi.fn(),
  mockCreateGoogleGenerativeAI: vi.fn(),
  mockCreateLitellm: vi.fn(),
  mockCreateVertex: vi.fn(),
  mockCreatePerplexity: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mockCreateAnthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mockCreateGoogleGenerativeAI }))
vi.mock('@/lib/chat/litellm', () => ({ createLitellm: mockCreateLitellm }))
vi.mock('@ai-sdk/google-vertex', () => ({ createVertex: mockCreateVertex }))
vi.mock('@ai-sdk/perplexity', () => ({ createPerplexity: mockCreatePerplexity }))
vi.mock('@/lib/env', () => ({
  default: {
    dumpLlmConversation: false,
  },
}))
vi.mock('@/lib/logging', () => ({
  loggingFetch: undefined,
}))

import { createLanguageModelBasic } from '@/backend/lib/chat/provider-factory'

const baseModel = {
  model: 'test-model',
  owned_by: 'openai',
} as any

describe('createLanguageModelBasic', () => {
  beforeEach(() => {
    mockCreateOpenAI.mockReset()
    mockCreateAnthropic.mockReset()
    mockCreateGoogleGenerativeAI.mockReset()
    mockCreateLitellm.mockReset()
    mockCreateVertex.mockReset()
    mockCreatePerplexity.mockReset()

    mockCreateOpenAI.mockReturnValue({ responses: vi.fn() })
    mockCreateAnthropic.mockReturnValue({ languageModel: vi.fn() })
    mockCreateGoogleGenerativeAI.mockReturnValue({ languageModel: vi.fn() })
    mockCreateLitellm.mockReturnValue({ languageModel: vi.fn() })
    mockCreateVertex.mockReturnValue({ languageModel: vi.fn() })
    mockCreatePerplexity.mockReturnValue({ languageModel: vi.fn() })
  })

  test('adds x-litellm-customer-id on logiclecloud OpenAI requests', () => {
    createLanguageModelBasic(
      {
        providerType: 'logiclecloud',
        apiKey: 'api-key',
        endPoint: 'https://proxy.example.com',
        provisioned: false,
      } as any,
      { ...baseModel, owned_by: 'openai' },
      { user: 'customer-1' }
    )

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-litellm-customer-id': 'customer-1' },
      })
    )
  })

  test('adds x-litellm-customer-id on logiclecloud Anthropic requests', () => {
    createLanguageModelBasic(
      {
        providerType: 'logiclecloud',
        apiKey: 'api-key',
        endPoint: 'https://proxy.example.com',
        provisioned: false,
      } as any,
      { ...baseModel, owned_by: 'anthropic' },
      { user: 'customer-1' }
    )

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-litellm-customer-id': 'customer-1' },
      })
    )
  })

  test('adds x-litellm-customer-id on logiclecloud Gemini requests', () => {
    createLanguageModelBasic(
      {
        providerType: 'logiclecloud',
        apiKey: 'api-key',
        endPoint: 'https://proxy.example.com',
        provisioned: false,
      } as any,
      { ...baseModel, owned_by: 'gemini' },
      { user: 'customer-1' }
    )

    expect(mockCreateGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-litellm-customer-id': 'customer-1' },
      })
    )
  })

  test('adds x-litellm-customer-id on generic logiclecloud LiteLLM requests', () => {
    createLanguageModelBasic(
      {
        providerType: 'logiclecloud',
        apiKey: 'api-key',
        endPoint: 'https://proxy.example.com',
        provisioned: false,
      } as any,
      { ...baseModel, owned_by: 'meta' },
      { user: 'customer-1' }
    )

    expect(mockCreateLitellm).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-litellm-customer-id': 'customer-1' },
      })
    )
  })

  test('does not add LiteLLM headers on direct provider requests', () => {
    createLanguageModelBasic(
      {
        providerType: 'openai',
        apiKey: 'api-key',
        provisioned: false,
      } as any,
      { ...baseModel, owned_by: 'openai' },
      { user: 'customer-1' }
    )

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.not.objectContaining({
        headers: expect.anything(),
      })
    )
  })
})
