import { EnrichedModel } from '.'

export const groqModels: EnrichedModel[] = [
  {
    name: 'Llama 3 8B',
    description: 'Llama 3 8B with 8192 context length',
    id: 'llama3-8b-8192',
    object: 'model',
    created: 1693721698,
    owned_by: 'Meta',
    context_length: 8192,
    tokenizer: 'llama',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.05,
      output: 0.1,
    },
  },
  {
    name: 'Llama 3 70B',
    description: 'Llama 3 70B with 8192 context length',
    id: 'llama3-70b-8192',
    object: 'model',
    created: 1693721698,
    owned_by: 'Meta',
    context_length: 8192,
    tokenizer: 'llama',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.59,
      output: 0.79,
    },
  },
  {
    name: 'Llama 2 70B',
    description: 'Llama 2 70B with 4096 tokens context length',
    id: 'llama3-70b-8192',
    object: 'model',
    created: 1693721698,
    owned_by: 'Meta',
    context_length: 4096,
    tokenizer: 'llama',
    capabilities: {
      vision: false,
      function_calling: false,
    },
    prices: {
      input: 0.64,
      output: 0.8,
    },
  },
  {
    name: 'Mixtral 8x7B',
    description: 'Mixtral 8x7B SMoE with 32K Context Length',
    id: 'mixtral-8x7b-32768',
    object: 'model',
    created: 1693721698,
    owned_by: 'Mistral',
    context_length: 32768,
    tokenizer: 'mistral',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.27,
      output: 0.27,
    },
  },
  {
    name: 'Gemma 7B',
    description: 'Gemma 7B with 8K Context Length',
    id: 'gemma-7b-it',
    object: 'model',
    created: 1693721698,
    owned_by: 'Google',
    context_length: 8192,
    tokenizer: 'google',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.1,
      output: 0.1,
    },
  },
]
