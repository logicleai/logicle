import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider'
import { FetchFunction, withoutTrailingSlash } from '@ai-sdk/provider-utils'
import { LiteLlmChatLanguageModel } from './litellm-chat-language-model'
import { LiteLlmProviderOptions } from './litellm-chat-options'

export interface LiteLlmProvider<CHAT_MODEL_IDS extends string = string> extends ProviderV2 {
  (modelId: CHAT_MODEL_IDS, settings?: LiteLlmProviderOptions): LanguageModelV2

  languageModel(modelId: CHAT_MODEL_IDS, settings?: LiteLlmProviderOptions): LanguageModelV2
}

export interface LiteLlmProviderSettings {
  /**
Base URL for the API calls.
   */
  baseURL: string

  /**
Provider name.
   */
  name: string

  /**
API key for authenticating requests. If specified, adds an `Authorization`
header to request headers with the value `Bearer <apiKey>`. This will be added
before any headers potentially specified in the `headers` option.
   */
  apiKey?: string

  /**
Optional custom headers to include in requests. These will be added to request headers
after any headers potentially added by use of the `apiKey` option.
   */
  headers?: Record<string, string>

  /**
Optional custom url query parameters to include in request urls.
   */
  queryParams?: Record<string, string>

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction
}

/**
Create an LiteLlm provider instance.
 */
export function createLiteLlm<CHAT_MODEL_IDS extends string>(
  options: LiteLlmProviderSettings
): LiteLlmProvider<CHAT_MODEL_IDS> {
  const baseURL = withoutTrailingSlash(options.baseURL)
  const providerName = options.name

  interface CommonModelConfig {
    provider: string
    url: ({ path }: { path: string }) => string
    headers: () => Record<string, string>
    fetch?: FetchFunction
  }

  const getHeaders = () => ({
    ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    ...options.headers,
  })

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `${providerName}.${modelType}`,
    url: ({ path }) => {
      const url = new URL(`${baseURL}${path}`)
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString()
      }
      return url.toString()
    },
    headers: getHeaders,
    fetch: options.fetch,
  })

  const createLanguageModel = (modelId: CHAT_MODEL_IDS) => createChatModel(modelId)

  const createChatModel = (modelId: CHAT_MODEL_IDS) =>
    new LiteLlmChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
    })

  const provider = (modelId: CHAT_MODEL_IDS) => createLanguageModel(modelId)

  provider.languageModel = createLanguageModel

  provider.chatModel = createChatModel

  provider.completionModel = () => {
    throw new Error('Completion model not implemented')
  }
  provider.textEmbeddingModel = () => {
    throw new Error('textEmbeddingModel not implemented')
  }
  provider.imageModel = () => {
    throw new Error('textEmbeddingModel not implemented')
  }
  provider.supportedUrls = []
  return provider as unknown as LiteLlmProvider<CHAT_MODEL_IDS>
}
