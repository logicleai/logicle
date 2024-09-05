import { EnrichedModel } from '.'

export const anthropicModels: EnrichedModel[] = [
  {
    name: 'Claude 3.5 Sonnet',
    description: 'Most intelligent model yet',
    id: 'claude-3-5-sonnet-20240620',
    object: 'model',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 3,
      output: 15,
    },
  },
  {
    name: 'Claude 3 Opus',
    description: 'Powerful model for highly complex tasks',
    id: 'claude-3-opus-20240229',
    object: 'model',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 15,
      output: 75,
    },
  },
  {
    name: 'Claude 3 Sonnet',
    description: 'Balance of intelligence and speed',
    id: 'claude-3-sonnet-20240229',
    object: 'model',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 3,
      output: 15,
    },
  },
  {
    name: 'Claude 3 Haiku',
    description: 'Fastest and most compact model for near-instant responsiveness',
    id: 'claude-3-haiku-20240307',
    object: 'model',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 0.25,
      output: 1.25,
    },
  },
]
