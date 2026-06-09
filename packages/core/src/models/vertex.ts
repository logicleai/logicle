import { LlmModel } from '.'

export const gemini15ProModel: LlmModel = {
  id: 'gemini-1.5-pro',
  model: 'gemini-2.5-pro', // Simplify migration
  name: 'Gemini 1.5 Pro',
  description: 'Vertex',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 2000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  tags: ['obsolete'],
}
export const gemini15FlashModel: LlmModel = {
  id: 'gemini-1.5-flash',
  model: 'gemini-2.5-flash', // Simplify migration
  name: 'Gemini 1.5 Flash',
  description: 'Vertex',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  tags: ['obsolete'],
}

export const gemini20FlashModel: LlmModel = {
  id: 'gemini-2.0-flash',
  model: 'gemini-2.5-flash',
  name: 'Gemini 2.0 Flash',
  description:
    'A Gemini 2.0 Flash model delivering enhanced multimodal capabilities, native tool use, and low latency for agentic applications.',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1048576,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  tags: ['obsolete'],
}

export const gemini20FlashLiteModel: LlmModel = {
  id: 'gemini-2.0-flash-lite',
  model: 'gemini-2.5-flash-lite', // simplify migration
  name: 'Gemini 2.0 Flash Lite',
  description: 'A Gemini 2.0 Flash model optimized for cost efficiency and low latency',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1048576,
  capabilities: {
    vision: false,
    function_calling: true,
  },
  tags: ['obsolete'],
}

export const gemini20ProModel: LlmModel = {
  id: 'gemini-2.0-pro',
  model: 'gemini-2.5-pro', // simplify migrations
  name: 'Gemini 2.0 Pro',
  description:
    'An experimental Gemini 2.0 model optimized for complex tasks and coding, featuring a 2M token context window and enhanced reasoning capabilities.',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 2097152,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  tags: ['obsolete'],
}

export const gemini25FlashModel: LlmModel = {
  id: 'gemini-2.5-flash',
  model: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  description:
    'Google first hybrid reasoning model, merging the speed and cost‑efficiency of 2.0 Flash with adjustable thinking budgets',
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
}

export const gemini25ProModel: LlmModel = {
  id: 'gemini-2.5-pro',
  model: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  description:
    "Google's latest large-scale model, offering advanced reasoning capabilities, multimodal understanding, and improved performance across a wide range of tasks",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
}

export const gemini30ProModel: LlmModel = {
  id: 'gemini-3.0-pro',
  model: 'gemini-3.1-pro-preview',
  name: 'Gemini 3.0 Pro',
  description:
    "Google's most intelligent model family to date, built on a foundation of state-of-the-art reasoning",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    web_search: true,
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
}

export const gemini31FlashLite: LlmModel = {
  id: 'gemini-3.1-flash-lite',
  model: 'gemini-3.1-flash-lite',
  name: 'Gemini 3.1 Flash lite',
  description:
    "Google's most intelligent model family to date, built on a foundation of state-of-the-art reasoning",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    web_search: true,
  },
  supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high'],
}

export const gemini31ProModel: LlmModel = {
  id: 'gemini-3.1-pro',
  model: 'gemini-3.1-pro-preview',
  name: 'Gemini 3.1 Pro',
  description:
    "Google's most intelligent model family to date, built on a foundation of state-of-the-art reasoning",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    web_search: true,
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
}

export const gemini35FlashModel: LlmModel = {
  id: 'gemini-3.5-flash',
  model: 'gemini-3.5-flash',
  name: 'Gemini 3.5 Flash',
  description:
    "Google's most intelligent model family to date, built on a foundation of state-of-the-art reasoning",
  provider: 'gcp-vertex',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
    web_search: true,
  },
  supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high'],
}

export const geminiProLatest: LlmModel = {
  ...gemini31ProModel,
  id: 'gemini-pro-latest',
  name: 'Gemini pro latest (3.1)',
  tags: ['latest'],
}

export const vertexModels: LlmModel[] = [
  geminiProLatest,
  gemini15ProModel,
  gemini15FlashModel,
  gemini20ProModel,
  gemini20FlashModel,
  gemini20FlashLiteModel,
  gemini25ProModel,
  gemini25FlashModel,
  gemini30ProModel,
  gemini31FlashLite,
  gemini31ProModel,
  gemini35FlashModel,
]
