import { EnrichedModel } from '.'

export const gpt4oModel: EnrichedModel = {
  name: 'GPT-4o',
  description:
    'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
  id: 'gpt-4o',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4oMiniModel: EnrichedModel = {
  name: 'GPT-4o mini',
  description:
    'GPT-4o mini (“o” for “omni”) is our most advanced model in the small models category, and our cheapest model yet. It is multimodal (accepting text or image inputs and outputting text), has higher intelligence than gpt-3.5-turbo but is just as fast. It is meant to be used for smaller tasks, including vision tasks.',
  id: 'gpt-4o-mini',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4TurboModel: EnrichedModel = {
  name: 'GPT-4 Turbo',
  description:
    'GPT-4 Turbo with Vision. The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling. Currently points to gpt-4-turbo-2024-04-09',
  id: 'gpt-4-turbo',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4Model: EnrichedModel = {
  name: 'GPT-4',
  description: 'Currently points to gpt-4-0613',
  id: 'gpt-4',
  owned_by: 'openai',
  context_length: 8192,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const gpt35Model: EnrichedModel = {
  name: 'GPT-3.5 Turbo',
  description: 'Currently points to gpt-3.5-turbo-0125',
  id: 'gpt-3.5-turbo',
  owned_by: 'openai',
  context_length: 16385,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const openaiModels: EnrichedModel[] = [
  gpt4oModel,
  gpt4oMiniModel,
  gpt4TurboModel,
  gpt4Model,
  gpt35Model,
]
