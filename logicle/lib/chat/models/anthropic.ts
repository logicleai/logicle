import { LlmModel } from '.'

export const claude35SonnetModel: LlmModel = {
  id: 'claude-3-5-sonnet-latest',
  name: 'Claude 3.5 Sonnet',
  description: 'Most intelligent model yet',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude35HaikuModel: LlmModel = {
  id: 'claude-3-5-haiku-latest',
  name: 'Claude 3.5 Haiku',
  description: 'Anthropic fastest model',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const claude3OpusModel: LlmModel = {
  id: 'claude-3-opus-latest',
  name: 'Claude 3 Opus',
  description: 'Powerful model for highly complex tasks',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3SonnetModel: LlmModel = {
  id: 'claude-3-sonnet-20240229',
  name: 'Claude 3 Sonnet',
  description: 'Balance of intelligence and speed',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3HaikuModel: LlmModel = {
  id: 'claude-3-haiku-20240307',
  name: 'Claude 3 Haiku',
  description: 'Fastest and most compact model for near-instant responsiveness',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const anthropicModels: LlmModel[] = [
  claude35SonnetModel,
  claude35HaikuModel,
  claude3OpusModel,
  claude3SonnetModel,
  claude3HaikuModel,
]
