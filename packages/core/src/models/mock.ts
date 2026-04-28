import { LlmModel } from '.'

export const mockEchoModel: LlmModel = {
  id: 'mock-echo',
  model: 'mock-echo',
  name: 'Mock Echo',
  description: 'A mock model for integration testing. Echoes the last user message.',
  provider: 'mock',
  owned_by: 'openai',
  context_length: 128000,
  capabilities: {
    vision: false,
    function_calling: false,
    reasoning: false,
  },
}

export const mockModels = [mockEchoModel]
