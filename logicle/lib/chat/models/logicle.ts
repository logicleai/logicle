import { EnrichedModel } from '.'

export const logicleModels: EnrichedModel[] = [
  {
    name: 'GPT-4o',
    description:
      'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
    id: 'gpt-4o',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'o200k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
  {
    name: 'GPT-4o mini',
    description:
      'GPT-4o mini (“o” for “omni”) is our most advanced model in the small models category, and our cheapest model yet. It is multimodal (accepting text or image inputs and outputting text), has higher intelligence than gpt-3.5-turbo but is just as fast. It is meant to be used for smaller tasks, including vision tasks.',
    id: 'gpt-4o-mini',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'o200k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
  {
    name: 'GPT-3.5 Turbo',
    description: 'Currently points to gpt-3.5-turbo-0125',
    id: 'gpt-3.5-turbo',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 16385,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: false,
      function_calling: true,
    },
  },
  {
    name: 'Claude 3.5 Sonnet',
    description: 'Most intelligent model yet',
    id: 'claude-3-5-sonnet',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
  {
    name: 'Claude 3 Opus',
    description: 'Powerful model for highly complex tasks',
    id: 'claude-3-opus',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
  {
    name: 'Claude 3 Sonnet',
    description: 'Balance of intelligence and speed',
    id: 'claude-3-sonnet',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
  {
    name: 'Claude 3 Haiku',
    description: 'Fastest and most compact model for near-instant responsiveness',
    id: 'claude-3-haiku',
    created: 1698959748,
    owned_by: 'anthropic',
    context_length: 200000,
    tokenizer: 'anthropic',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
]
