export enum ProviderType {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  LogicleCloud = 'logiclecloud',
  GcpVertex = 'gcp-vertex',
}

export enum ModelDetectionMode {
  AUTO = 'Auto',
  MANUAL = 'Manual',
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
  providerType: ProviderType.GcpVertex
  apiKey: string
  endPoint: string
}

export type ProviderConfig =
  | ProviderConfigOpenAI
  | ProviderConfigAnthropic
  | ProviderConfigGcpVertex
  | ProviderConfigLogicleCloud
