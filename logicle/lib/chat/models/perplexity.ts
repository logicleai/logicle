import { LlmModel } from '.'

export const sonarModel: LlmModel = {
  id: 'sonar',
  name: 'Sonar',
  description: 'Sonar, perplexity model',
  owned_by: 'perplexity',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const sonarProModel: LlmModel = {
  id: 'sonar-pro',
  name: 'Sonar Pro',
  description: 'Sonar, perplexity model',
  owned_by: 'perplexity',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const perplexityModels: LlmModel[] = [sonarModel, sonarProModel]
