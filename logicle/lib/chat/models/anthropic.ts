import { LlmModel } from '.'

export const claudeThinkingBudgetTokens = (reasoning_effort?: 'low' | 'medium' | 'high') => {
  switch (reasoning_effort) {
    case 'low':
      return 1024
    case 'medium':
      return 2048
    case 'high':
      return 4096
    default:
      return undefined
  }
}

export const claude4SonnetModel: LlmModel = {
  id: 'claude-sonnet-4-20250514',
  name: 'Claude 4 Sonnet',
  description:
    'High-performance hybrid reasoning model with exceptional efficiency, enhanced coding and memory capabilities, and support for extended thinking mode.',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf'],
  },
}

export const claude4OpusModel: LlmModel = {
  id: 'claude-opus-4-20250514',
  name: 'Claude 4 Opus',
  description:
    'Most capable hybrid reasoning model with advanced coding prowess, sustained autonomous operation for multi-hour tasks, and extended thinking mode.',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf'],
  },
}
export const claude37SonnetModel: LlmModel = {
  id: 'claude-3-7-sonnet-latest',
  name: 'Claude 3.7 Sonnet',
  description:
    'Hybrid reasoning model with extended thinking mode and advanced coding capabilities.',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf'],
  },
}

export const claude35SonnetModel: LlmModel = {
  id: 'claude-3-5-sonnet-latest',
  name: 'Claude 3.5 Sonnet',
  description: 'Most intelligent model yet',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
}

export const claude35HaikuModel: LlmModel = {
  id: 'claude-3-5-haiku-latest',
  name: 'Claude 3.5 Haiku',
  description: 'Anthropic fastest model',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
}

export const claude3OpusModel: LlmModel = {
  id: 'claude-3-opus-latest',
  name: 'Claude 3 Opus',
  description: 'Powerful model for highly complex tasks',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const claude3SonnetModel: LlmModel = {
  id: 'claude-3-sonnet-20240229',
  name: 'Claude 3 Sonnet',
  description: 'Balance of intelligence and speed',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const claude3HaikuModel: LlmModel = {
  id: 'claude-3-haiku-20240307',
  name: 'Claude 3 Haiku',
  description: 'Fastest and most compact model for near-instant responsiveness',
  provider: 'anthropic',
  owned_by: 'anthropic',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
  },
}

export const anthropicModels: LlmModel[] = [
  claude3OpusModel,
  claude3SonnetModel,
  claude3HaikuModel,
  claude35SonnetModel,
  claude35HaikuModel,
  claude37SonnetModel,
  claude4SonnetModel,
  claude4OpusModel,
]
