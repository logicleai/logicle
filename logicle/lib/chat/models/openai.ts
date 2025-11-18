import { LlmModel } from '.'

export const gpt35Model: LlmModel = {
  id: 'gpt-3.5-turbo',
  model: 'gpt-3.5-turbo',
  name: 'GPT-3.5 Turbo',
  description: 'Currently points to gpt-3.5-turbo',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 16385,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: false,
  },
  tags: ['obsolete'],
}

export const gpt4TurboModel: LlmModel = {
  id: 'gpt-4-turbo',
  model: 'gpt-4-turbo',
  name: 'GPT-4 Turbo',
  description:
    'GPT-4 Turbo with Vision. The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling. Currently points to gpt-4-turbo-2024-04-09',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
  tags: ['obsolete'],
}

export const gpt4Model: LlmModel = {
  id: 'gpt-4',
  model: 'gpt-4',
  name: 'GPT-4',
  description: 'Currently points to gpt-4',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 8192,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
  tags: ['obsolete'],
}

export const gpt4oModel: LlmModel = {
  id: 'gpt-4o',
  model: 'gpt-4o',
  name: 'GPT-4o',
  description:
    'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
  tags: ['obsolete'],
}
export const gpt4oMiniModel: LlmModel = {
  id: 'gpt-4o-mini',
  model: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  description:
    'GPT-4o mini (“o” for “omni”) is our most advanced model in the small models category, and our cheapest model yet. It is multimodal (accepting text or image inputs and outputting text), has higher intelligence than gpt-3.5-turbo but is just as fast. It is meant to be used for smaller tasks, including vision tasks.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
  tags: ['obsolete'],
}

export const gpt41Model: LlmModel = {
  id: 'gpt-4.1',
  model: 'gpt-4.1',
  name: 'GPT-4.1',
  description: 'GPT-4.1',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 1047576,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
}

export const gpt41MiniModel: LlmModel = {
  id: 'gpt-4.1-mini',
  model: 'gpt-4.1-mini',
  name: 'GPT-4.1 Mini',
  description: 'GPT-4.1 Mini',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 1047576,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
}

export const gpt41NanoModel: LlmModel = {
  id: 'gpt-4.1-nano',
  model: 'gpt-4.1-nano',
  name: 'GPT-4.1 Nano',
  description: 'GPT-4.1 Nano',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 1047576,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: false,
    supportedMedia: ['application/pdf'],
  },
}

export const o1Model: LlmModel = {
  id: 'o1',
  model: 'o1',
  name: 'O1',
  description:
    'A high-performance reasoning model optimized for complex problem-solving in science, coding, and mathematics. Currently points to o1-2024-12-05.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
  },
  tags: ['obsolete'],
}

export const o1MiniModel: LlmModel = {
  id: 'o1-mini',
  model: 'o1-mini',
  name: 'O1 Mini',
  description:
    'A cost-effective reasoning model tailored for STEM applications, excelling in math and coding tasks. Currently points to o1-mini-2024-09-12.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 64000,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: true,
  },
  tags: ['obsolete'],
}

export const o3Model: LlmModel = {
  id: 'o3',
  model: 'o3',
  name: 'O3',
  description:
    'A powerful reasoning model, trained to think longer before responding with full tool access',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf'],
  },
  tags: ['obsolete'],
}

export const o3DeepResearchModel: LlmModel = {
  id: 'o3-deep-research',
  model: 'o3-deep-research',
  name: 'O3 Deep Research',
  description:
    'OpenAI o3-based Deep Research model for multi-step web research and synthesis via the Responses API (web_search, Python, MCP, background tasks).',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: true, // Deep Research can analyze images/PDFs it finds or that you attach
    function_calling: true, // uses Responses API "tools" (web_search_preview, code_interpreter, mcp)
    reasoning: true,
    supportedMedia: ['text/html', 'application/pdf', 'image/png', 'image/jpeg'],
  },
  // optional: you can keep a shorthand alias if your code accepts it
  // aliases: ['o3-deep-research'],
}
export const o3MiniModel: LlmModel = {
  id: 'o3-mini',
  model: 'o3-mini',
  name: 'O3 Mini',
  description:
    'Small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: false,
    function_calling: true,
    reasoning: true,
  },
  tags: ['obsolete'],
}

export const o4MiniModel: LlmModel = {
  id: 'o4-mini',
  model: 'o4-mini',
  name: 'O4 Mini',
  description:
    'Small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf'],
  },
}

export const o4MiniDeepResearchModel: LlmModel = {
  id: 'o4-mini-deep-research',
  model: 'o4-mini-deep-research',
  name: 'O4 Mini Deep Research',
  description:
    'Lightweight Deep Research model based on o4-mini for faster, lower-cost agentic research via the Responses API.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 200000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['text/html', 'application/pdf', 'image/png', 'image/jpeg'],
  },
}

export const gpt5Model: LlmModel = {
  id: 'gpt-5',
  model: 'gpt-5',
  name: 'GPT-5',
  description:
    'Flagship GPT-5 model for coding and agentic tasks; supports deep reasoning with API controls like reasoning_effort.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000, // ~272k in + 128k out
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'low',
}

export const gpt5MiniModel: LlmModel = {
  id: 'gpt-5-mini',
  model: 'gpt-5-mini',
  name: 'GPT-5 Mini',
  description:
    'Smaller, faster, more cost-efficient GPT-5 for well-defined tasks; supports reasoning controls.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'low',
}

export const gpt5NanoModel: LlmModel = {
  id: 'gpt-5-nano',
  model: 'gpt-5-nano',
  name: 'GPT-5 Nano',
  description:
    'Ultra-light GPT-5 variant optimized for speed and cost; reasoning controls available.',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'low',
}

export const gpt51Model: LlmModel = {
  id: 'gpt-5.1',
  model: 'gpt-5.1',
  name: 'GPT-5.1',
  description: 'A smarter, more conversational ChatGPT',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000, // ~272k in + 128k out
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'low',
}

export const gpt5ChatModel: LlmModel = {
  id: 'gpt-5-chat-latest',
  model: 'gpt-5-chat-latest',
  name: 'GPT-5 Chat',
  description: 'A smarter, more conversational ChatGPT',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000, // ~272k in + 128k out
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'medium',
}

export const gpt51ChatModel: LlmModel = {
  id: 'gpt-5.1-chat-latest',
  model: 'gpt-5.1-chat-latest',
  name: 'GPT-5.1 Chat',
  description: 'A smarter, more conversational ChatGPT',
  provider: 'openai',
  owned_by: 'openai',
  context_length: 400000, // ~272k in + 128k out
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
  defaultReasoning: 'medium',
}

export const gptLatest: LlmModel = {
  ...gpt51Model,
  id: 'gpt-5-latest',   // it should be gpt-latest...
  name: 'Gpt latest (5.1)',
  tags: ['latest'],
}

export const openaiModels: LlmModel[] = [
  gptLatest,
  gpt35Model,
  gpt41Model,
  gpt41MiniModel,
  gpt41NanoModel,
  gpt4oModel,
  gpt4oMiniModel,
  gpt4TurboModel,
  gpt4Model,
  gpt5Model,
  gpt5MiniModel,
  gpt5NanoModel,
  gpt5ChatModel,
  gpt51Model,
  gpt51ChatModel,
  o1Model,
  o1MiniModel,
  o3Model,
  o3MiniModel,
  o3DeepResearchModel,
  o4MiniModel,
  o4MiniDeepResearchModel,
]
