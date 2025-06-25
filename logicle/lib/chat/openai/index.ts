export type { OpenAIResponsesProviderOptions } from './openai-responses-language-model'

import { LanguageModelV2 } from '@ai-sdk/provider'
import { FetchFunction, loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils'
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model'

export interface OpenAIProviderSettings {
  /**
Base URL for the OpenAI API calls.
     */
  baseURL?: string

  /**
API key for authenticating requests.
     */
  apiKey?: string

  /**
OpenAI Organization.
     */
  organization?: string

  /**
OpenAI project.
     */
  project?: string

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>

  /**
Provider name. Overrides the `openai` default name for 3rd party providers.
   */
  name?: string

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction
}

/**
Create an OpenAI provider instance.
 */
export function createOpenAIResponses(
  options: OpenAIProviderSettings = {},
  modelId: string
): LanguageModelV2 {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? 'https://api.openai.com/v1'

  const providerName = options.name ?? 'openai'

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'OPENAI_API_KEY',
      description: 'OpenAI',
    })}`,
    'OpenAI-Organization': options.organization,
    'OpenAI-Project': options.project,
    ...options.headers,
  })

  return new OpenAIResponsesLanguageModel(modelId, {
    provider: `${providerName}.responses`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  })
}
