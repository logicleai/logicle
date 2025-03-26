import { LlmModel } from '.'

export const sonarModel: LlmModel = {
  id: 'sonar',
  name: 'Sonar',
  description: 'Lightweight offering with search grounding, quicker and cheaper than Sonar Pro',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
  },
}
export const sonarProModel: LlmModel = {
  id: 'sonar-pro',
  name: 'Sonar Pro',
  description:
    'Premier search offering with search grounding, supporting advanced queries and follow-ups',
  owned_by: 'perplexity',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
  },
}

export const sonarReasoningModel: LlmModel = {
  id: 'sonar-reasoning',
  name: 'Sonar Reasoning',
  description:
    'Lightweight reasoning offering powered by reasoning models trained with DeepSeek R1',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
  },
}

export const sonarReasoningProModel: LlmModel = {
  id: 'sonar-reasoning-pro',
  name: 'Sonar Reasoning Pro',
  description: 'Premier reasoning offering powered by DeepSeek',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
  },
}

export const sonarDeepResearchModel: LlmModel = {
  id: 'sonar-deep-research',
  name: 'Sonar Deep Research',
  description:
    'Deep Research conducts comprehensive, expert-level research and synthesizes it into accessible, actionable reports',
  owned_by: 'perplexity',
  context_length: 131072,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: true,
  },
}
export const perplexityModels: LlmModel[] = [
  sonarModel,
  sonarProModel,
  sonarReasoningModel,
  sonarReasoningProModel,
  sonarDeepResearchModel,
]
