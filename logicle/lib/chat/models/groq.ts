import { LlmModel } from '.'

export const groqModels: LlmModel[] = [
  {
    id: 'llama3-8b-8192',
    name: 'Llama 3 8B',
    description: 'Llama 3 8B with 8192 context length',
    owned_by: 'Meta',
    context_length: 8192,
    capabilities: {
      vision: false,
      function_calling: true,
    },
  },
  {
    id: 'llama3-70b-8192',
    name: 'Llama 3 70B',
    description: 'Llama 3 70B with 8192 context length',
    owned_by: 'Meta',
    context_length: 8192,
    capabilities: {
      vision: false,
      function_calling: true,
    },
  },
  {
    id: 'llama3-70b-8192',
    name: 'Llama 2 70B',
    description: 'Llama 2 70B with 4096 tokens context length',
    owned_by: 'Meta',
    context_length: 4096,
    capabilities: {
      vision: false,
      function_calling: false,
    },
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    description: 'Mixtral 8x7B SMoE with 32K Context Length',
    owned_by: 'Mistral',
    context_length: 32768,
    capabilities: {
      vision: false,
      function_calling: true,
    },
  },
  {
    id: 'gemma-7b-it',
    name: 'Gemma 7B',
    description: 'Gemma 7B with 8K Context Length',
    owned_by: 'Google',
    context_length: 8192,
    capabilities: {
      vision: false,
      function_calling: true,
    },
  },
]
