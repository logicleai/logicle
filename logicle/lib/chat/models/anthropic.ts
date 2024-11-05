import { EnrichedModel } from '.'

export const claude35SonnetModel: EnrichedModel = {
  name: 'Claude 3.5 Sonnet',
  description: 'Most intelligent model yet',
  id: 'claude-3-5-sonnet-latest',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude35HaikuModel: EnrichedModel = {
  name: 'Claude 3.5 Haiku',
  description: 'Anthropic fastest model',
  id: 'claude-3-5-haiku-latest',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const claude3OpusModel: EnrichedModel = {
  name: 'Claude 3 Opus',
  description: 'Powerful model for highly complex tasks',
  id: 'claude-3-opus-latest',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3SonnetModel: EnrichedModel = {
  name: 'Claude 3 Sonnet',
  description: 'Balance of intelligence and speed',
  id: 'claude-3-sonnet-20240229',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3HaikuModel: EnrichedModel = {
  name: 'Claude 3 Haiku',
  description: 'Fastest and most compact model for near-instant responsiveness',
  id: 'claude-3-haiku-20240307',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const anthropicModels: EnrichedModel[] = [
  claude35SonnetModel,
  claude35HaikuModel,
  claude3OpusModel,
  claude3SonnetModel,
  claude3HaikuModel,
]
