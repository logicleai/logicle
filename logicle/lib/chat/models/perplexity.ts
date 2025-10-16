import { LlmModel } from '.'

export const sonarModel: LlmModel = {
  id: 'sonar',
  model: 'sonar',
  name: 'Sonar',
  description: 'Lightweight offering with search grounding, quicker and cheaper than Sonar Pro',
  provider: 'perplexity',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
    knowledge: false,
  },
}
export const sonarProModel: LlmModel = {
  id: 'sonar-pro',
  model: 'sonar-pro',
  name: 'Sonar Pro',
  description:
    'Premier search offering with search grounding, supporting advanced queries and follow-ups',
  provider: 'perplexity',
  owned_by: 'perplexity',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
    knowledge: false,
  },
}

export const sonarReasoningModel: LlmModel = {
  id: 'sonar-reasoning',
  model: 'sonar-reasoning',
  name: 'Sonar Reasoning',
  description:
    'Lightweight reasoning offering powered by reasoning models trained with DeepSeek R1',
  provider: 'perplexity',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
    knowledge: false,
  },
}

export const sonarReasoningProModel: LlmModel = {
  id: 'sonar-reasoning-pro',
  model: 'sonar-reasoning-pro',
  name: 'Sonar Reasoning Pro',
  description: 'Premier reasoning offering powered by DeepSeek',
  provider: 'perplexity',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
    knowledge: false,
  },
}

export const sonarDeepResearchModel: LlmModel = {
  id: 'sonar-deep-research',
  model: 'sonar-deep-research',
  name: 'Sonar Deep Research',
  description:
    'Deep Research conducts comprehensive, expert-level research and synthesizes it into accessible, actionable reports',
  provider: 'perplexity',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
    knowledge: false,
  },
}

export const sonarLatest: LlmModel = {
  ...sonarProModel,
  id: 'sonar-latest',
  name: 'Sonar latest (Pro)',
  tags: ['latest'],
}

export const perplexityModels: LlmModel[] = [
  sonarLatest,
  sonarModel,
  sonarProModel,
  sonarReasoningModel,
  sonarReasoningProModel,
  sonarDeepResearchModel,
]
