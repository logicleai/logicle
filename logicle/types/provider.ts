export const providerTypes = [
  'openai',
  'anthropic',
  'logiclecloud',
  'perplexity',
  'gcp-vertex',
  'googlegenai',
] as const

export type ProviderType = (typeof providerTypes)[number]

export interface BaseProviderConfig {
  name: string
  providerType: ProviderType
  provisioned: number
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

export interface ProviderConfigGoogleGenAi extends BaseProviderConfig {
  providerType: 'googlegenai'
  apiKey: string
}

export type ProviderConfig =
  | ProviderConfigOpenAI
  | ProviderConfigAnthropic
  | ProviderConfigGcpVertex
  | ProviderConfigPerplexity
  | ProviderConfigLogicleCloud
  | ProviderConfigGoogleGenAi
