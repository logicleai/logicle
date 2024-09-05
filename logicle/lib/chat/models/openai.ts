import { EnrichedModel } from '.'

export const openaiModels: EnrichedModel[] = [
  {
    name: 'GPT-4o',
    description:
      'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
    id: 'gpt-4o',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'o200k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 5,
      output: 15,
    },
  },
  {
    name: 'GPT-4o mini',
    description:
      'GPT-4o mini (“o” for “omni”) is our most advanced model in the small models category, and our cheapest model yet. It is multimodal (accepting text or image inputs and outputting text), has higher intelligence than gpt-3.5-turbo but is just as fast. It is meant to be used for smaller tasks, including vision tasks.',
    id: 'gpt-4o-mini',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'o200k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 0.15,
      output: 0.6,
    },
  },
  {
    name: 'GPT-4 Turbo',
    description:
      'GPT-4 Turbo with Vision. The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling. Currently points to gpt-4-turbo-2024-04-09',
    id: 'gpt-4-turbo',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 10,
      output: 30,
    },
  },
  {
    name: 'GPT-4',
    description: 'Currently points to gpt-4-0613',
    id: 'gpt-4',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 8192,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 30,
      output: 60,
    },
  },
  {
    name: 'GPT-3.5 Turbo',
    description: 'Currently points to gpt-3.5-turbo-0125',
    id: 'gpt-3.5-turbo',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 16385,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.5,
      output: 1.5,
    },
  },
]
