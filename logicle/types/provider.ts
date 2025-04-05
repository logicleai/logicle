export const providerTypes = [
  'openai',
  'anthropic',
  'logiclecloud',
  'perplexity',
  'gcp-vertex',
] as const

export type ProviderType = (typeof providerTypes)[number]

export interface BaseProviderConfig {
  provisioned: number
  providerType: ProviderType
}

export interface ProviderConfigOpenAI extends BaseProviderConfig {
  providerType: 'openai'
  apiKey: string
}

export interface ProviderConfigAnthropic extends BaseProviderConfig {
  providerType: 'anthropic'
  apiKey: string
}

export interface ProviderConfigPerplexity extends BaseProviderConfig {
  providerType: 'perplexity'
  apiKey: string
}

export interface ProviderConfigGcpVertex extends BaseProviderConfig {
  providerType: 'gcp-vertex'
  credentials: string
}

export interface ProviderConfigLogicleCloud extends BaseProviderConfig {
  providerType: 'logiclecloud'
  apiKey: string
  endPoint: string
}

export type ProviderConfig =
  | ProviderConfigOpenAI
  | ProviderConfigAnthropic
  | ProviderConfigGcpVertex
  | ProviderConfigPerplexity
  | ProviderConfigLogicleCloud
