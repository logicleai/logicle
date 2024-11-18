export enum ProviderType {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  LogicleCloud = 'logiclecloud',
  GcpVertex = 'gcp-vertex',
}

export interface BaseProviderConfig {
  provisioned: number
}

export interface ProviderConfigOpenAI extends BaseProviderConfig {
  providerType: ProviderType.OpenAI
  apiKey: string
}

export interface ProviderConfigAnthropic extends BaseProviderConfig {
  providerType: ProviderType.Anthropic
  apiKey: string
}

export interface ProviderConfigGcpVertex extends BaseProviderConfig {
  providerType: ProviderType.GcpVertex
  credentials: string
}

export interface ProviderConfigLogicleCloud extends BaseProviderConfig {
  providerType: ProviderType.LogicleCloud
  apiKey: string
  endPoint: string
}

export type ProviderConfig =
  | ProviderConfigOpenAI
  | ProviderConfigAnthropic
  | ProviderConfigGcpVertex
  | ProviderConfigLogicleCloud
