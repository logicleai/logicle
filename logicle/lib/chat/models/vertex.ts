import { LlmModel } from '.'

export const gemini15ProModel: LlmModel = {
  id: 'gemini-1.5-pro',
  name: 'Gemini 1.5 Pro',
  description: 'Vertex',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 2000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}
export const gemini15FlashModel: LlmModel = {
  id: 'gemini-1.5-flash',
  name: 'Gemini 1.5 Flash',
  description: 'Vertex',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const gemini20FlashModel: LlmModel = {
  id: 'gemini-2.0-flash',
  name: 'Gemini 2.0 Flash',
  description:
    'A Gemini 2.0 Flash model delivering enhanced multimodal capabilities, native tool use, and low latency for agentic applications.',
  provider: 'gcp-vertex',
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
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1048576,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: false,
  },
}

export const gemini20ProModel: LlmModel = {
  id: 'gemini-2.0-pro',
  name: 'Gemini 2.0 Pro',
  description:
    'An experimental Gemini 2.0 model optimized for complex tasks and coding, featuring a 2M token context window and enhanced reasoning capabilities.',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 2097152,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const gemini25ProModel: LlmModel = {
  id: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  description:
    "Google's latest large-scale model, offering advanced reasoning capabilities, multimodal understanding, and improved performance across a wide range of tasks",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
  },
}

export const gemini25FlashModel: LlmModel = {
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  description:
    'Google first hybrid reasoning model, merging the speed and cost‑efficiency of 2.0 Flash with adjustable thinking budgets',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
  },
}

export const vertexModels: LlmModel[] = [
  gemini15ProModel,
  gemini15FlashModel,
  { ...gemini20ProModel, id: 'gemini-2.0-pro-exp-02-05' }, // Temporary ID for the experimental model
  gemini20FlashModel,
  gemini20FlashLiteModel,
  { ...gemini25ProModel, id: 'gemini-2.5-pro-preview-03-25' }, // Temporary ID for the experimental model
]
