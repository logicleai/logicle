import { LanguageModelV2, LanguageModelV3, ProviderV2, ProviderV3 } from '@ai-sdk/provider'
import { FetchFunction, withoutTrailingSlash } from '@ai-sdk/provider-utils'
import { LitellmChatLanguageModel } from './litellm-chat-language-model'
import { LitellmProviderOptions } from './litellm-chat-options'

export interface LitellmProvider<CHAT_MODEL_IDS extends string = string> extends ProviderV3 {
  (modelId: CHAT_MODEL_IDS, settings?: LitellmProviderOptions): LanguageModelV3

  languageModel(modelId: CHAT_MODEL_IDS, settings?: LitellmProviderOptions): LanguageModelV3
}

export interface LitellmProviderSettings {
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
Create an Litellm provider instance.
 */
export function createLitellm<CHAT_MODEL_IDS extends string>(
  options: LitellmProviderSettings
): LitellmProvider<CHAT_MODEL_IDS> {
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
    new LitellmChatLanguageModel(modelId, {
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
  return provider as unknown as LitellmProvider<CHAT_MODEL_IDS>
}
