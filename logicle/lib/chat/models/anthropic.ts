import { EnrichedModel } from '.'

export const claude35SonnetModel = {
  name: 'Claude 3.5 Sonnet',
  description: 'Most intelligent model yet',
  id: 'claude-3-5-sonnet-20240620',
  created: 1698959748,
  owned_by: 'anthropic',
  context_length: 200000,
  tokenizer: 'anthropic',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3OpusModel = {
  name: 'Claude 3 Opus',
  description: 'Powerful model for highly complex tasks',
  id: 'claude-3-opus-20240229',
  created: 1698959748,
  owned_by: 'anthropic',
  context_length: 200000,
  tokenizer: 'anthropic',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3SonnetModel = {
  name: 'Claude 3 Sonnet',
  description: 'Balance of intelligence and speed',
  id: 'claude-3-sonnet-20240229',
  created: 1698959748,
  owned_by: 'anthropic',
  context_length: 200000,
  tokenizer: 'anthropic',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const claude3HaikuModel = {
  name: 'Claude 3 Haiku',
  description: 'Fastest and most compact model for near-instant responsiveness',
  id: 'claude-3-haiku-20240307',
  created: 1698959748,
  owned_by: 'anthropic',
  context_length: 200000,
  tokenizer: 'anthropic',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const anthropicModels: EnrichedModel[] = [
  claude35SonnetModel,
  claude3OpusModel,
  claude3SonnetModel,
  claude3HaikuModel,
]
