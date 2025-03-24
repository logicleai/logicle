import { LlmModel } from '.'

export const gemini15ProModel: LlmModel = {
  name: 'Gemini 1.5 Pro',
  description: 'Vertex',
  id: 'gemini-1.5-pro',
  owned_by: 'google',
  context_length: 2000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}
export const gemini15FlashModel: LlmModel = {
  name: 'Gemini 1.5 Flash',
  description: 'Vertex',
  id: 'gemini-1.5-flash',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const gemini20FlashModel: LlmModel = {
  name: 'Gemini 2.0 Flash',
  description:
    'A Gemini 2.0 Flash model delivering enhanced multimodal capabilities, native tool use, and low latency for agentic applications.',
  id: 'gemini-2.0-flash',
  owned_by: 'google',
  context_length: 1048576,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const gemini20FlashLiteModel: LlmModel = {
  name: 'Gemini 2.0 Flash Lite',
  description: 'A Gemini 2.0 Flash model optimized for cost efficiency and low latency',
  id: 'gemini-2.0-flash-lite',
  owned_by: 'google',
  context_length: 1048576,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
  },
}

export const gemini20ProModel: LlmModel = {
  name: 'Gemini 2.0 Pro',
  description:
    'An experimental Gemini 2.0 model optimized for complex tasks and coding, featuring a 2M token context window and enhanced reasoning capabilities.',
  id: 'gemini-2.0-pro',
  owned_by: 'google',
  context_length: 2097152,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const vertexModels: LlmModel[] = [
  gemini15ProModel,
  gemini15FlashModel,
  { ...gemini20ProModel, id: 'gemini-2.0-pro-exp-02-05' }, // Temporary ID for the experimental model
  gemini20FlashModel,
  gemini20FlashLiteModel,
]
