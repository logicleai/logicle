export enum ProviderType {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  LogicleCloud = 'logiclecloud',
  GcpVertex = 'gcp-vertex',
}

export interface BaseProviderConfig {
  providerType: ProviderType
}

export interface ProviderConfigOpenAI {
  providerType: ProviderType.OpenAI
  apiKey: string
}

export interface ProviderConfigAnthropic {
  providerType: ProviderType.Anthropic
  apiKey: string
}

export interface ProviderConfigGcpVertex {
  providerType: ProviderType.GcpVertex
  credentials: string
}

export interface ProviderConfigLogicleCloud {
  providerType: ProviderType.LogicleCloud
  apiKey: string
  endPoint: string
}

export type ProviderConfig =
  | ProviderConfigOpenAI
  | ProviderConfigAnthropic
  | ProviderConfigGcpVertex
  | ProviderConfigLogicleCloud
