import { LlmModel } from '.'

export const gpt4oModel: LlmModel = {
  id: 'gpt-4o',
  name: 'GPT-4o',
  description:
    'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4oMiniModel: LlmModel = {
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  description:
    'GPT-4o mini (“o” for “omni”) is our most advanced model in the small models category, and our cheapest model yet. It is multimodal (accepting text or image inputs and outputting text), has higher intelligence than gpt-3.5-turbo but is just as fast. It is meant to be used for smaller tasks, including vision tasks.',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4TurboModel: LlmModel = {
  id: 'gpt-4-turbo',
  name: 'GPT-4 Turbo',
  description:
    'GPT-4 Turbo with Vision. The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling. Currently points to gpt-4-turbo-2024-04-09',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const gpt4Model: LlmModel = {
  id: 'gpt-4',
  name: 'GPT-4',
  description: 'Currently points to gpt-4',
  owned_by: 'openai',
  context_length: 8192,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const gpt35Model: LlmModel = {
  id: 'gpt-3.5-turbo',
  name: 'GPT-3.5 Turbo',
  description: 'Currently points to gpt-3.5-turbo',
  owned_by: 'openai',
  context_length: 16385,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const o1Model: LlmModel = {
  id: 'o1',
  name: 'O1',
  description:
    'A high-performance reasoning model optimized for complex problem-solving in science, coding, and mathematics. Currently points to o1-2024-12-05.',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const o1MiniModel: LlmModel = {
  id: 'o1-mini',
  name: 'O1 Mini',
  description:
    'A cost-effective reasoning model tailored for STEM applications, excelling in math and coding tasks. Currently points to o1-mini-2024-09-12.',
  owned_by: 'openai',
  context_length: 64000,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const o3MiniModel: LlmModel = {
  id: 'o3-mini',
  name: 'O3 Mini',
  description:
    'Small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: true,
  },
}

export const openaiModels: LlmModel[] = [
  gpt4oModel,
  gpt4oMiniModel,
  gpt4TurboModel,
  gpt4Model,
  gpt35Model,
  o1Model,
  o1MiniModel,
  o3MiniModel,
]
