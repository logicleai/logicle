import * as ai from 'ai'
import { LanguageModelV3 } from '@ai-sdk/provider'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as google from '@ai-sdk/google'
import * as vertex from '@ai-sdk/google-vertex'
import * as perplexity from '@ai-sdk/perplexity'
import * as litellm from '@/lib/chat/litellm'
import { JWTInput } from 'google-auth-library'
import { expandEnv } from 'templates'
import env from '@/lib/env'
import { loggingFetch } from '@/lib/logging'
import { LlmModel } from '@/lib/chat/models'
import { ProviderConfig } from '@/types/provider'
import { EchoLanguageModel } from './echo-language-model'

export function createLanguageModelBasic(params: ProviderConfig, model: LlmModel): LanguageModelV3 {
  const fetch = env.dumpLlmConversation ? loggingFetch : undefined
  switch (params.providerType) {
    case 'openai':
      return openai
        .createOpenAI({
          apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
          fetch,
        })
        .responses(model.model)
    case 'anthropic':
      return anthropic
        .createAnthropic({
          apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
          fetch,
        })
        .languageModel(model.model)
    case 'perplexity':
      return perplexity
        .createPerplexity({
          apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
          fetch,
        })
        .languageModel(model.model)
    case 'gcp-vertex': {
      let credentials: JWTInput
      try {
        credentials = JSON.parse(
          params.provisioned ? expandEnv(params.credentials) : params.credentials
        ) as JWTInput
      } catch {
        throw new Error('Invalid gcp configuration, it must be a JSON object')
      }
      return vertex
        .createVertex({
          location: 'us-central1',
          project: credentials.project_id,
          googleAuthOptions: {
            credentials: credentials,
          },
          fetch,
        })
        .languageModel(model.model)
    }
    case 'gemini':
      return google
        .createGoogleGenerativeAI({
          apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
          fetch,
        })
        .languageModel(model.model)
    case 'logiclecloud': {
      if (model.owned_by === 'openai') {
        return openai
          .createOpenAI({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            baseURL: params.endPoint,
            fetch,
          })
          .responses(model.model)
      } else if (model.owned_by === 'anthropic') {
        return anthropic
          .createAnthropic({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            baseURL: `${params.endPoint}/v1`,
            fetch,
          })
          .languageModel(model.model)
      } else if (model.owned_by === 'gemini') {
        return google
          .createGoogleGenerativeAI({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            baseURL: `${params.endPoint}/v1`,
            fetch,
          })
          .languageModel(model.model)
      } else {
        return litellm
          .createLitellm({
            name: 'litellm',
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            baseURL: params.endPoint,
            fetch,
          })
          .languageModel(model.model)
      }
    }
    case 'mock': {
      if (!env.allowMockProvider) {
        throw new Error('Mock provider is not enabled (set ALLOW_MOCK_PROVIDER=1)')
      }
      return new EchoLanguageModel()
    }
    default: {
      throw new Error('Unknown provider type')
    }
  }
}

export function createLanguageModel(params: ProviderConfig, model: LlmModel): LanguageModelV3 {
  let languageModel = createLanguageModelBasic(params, model)
  if (model.owned_by === 'perplexity') {
    languageModel = ai.wrapLanguageModel({
      model: languageModel,
      middleware: ai.extractReasoningMiddleware({ tagName: 'think' }),
    })
  }
  return languageModel
}
