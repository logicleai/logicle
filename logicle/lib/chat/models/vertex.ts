import { EnrichedModel } from '.'

export const vertexModels: EnrichedModel[] = [
  {
    name: 'gemini-1.5-pro',
    description: 'Vertex',
    id: 'gemini-1.5-pro',
    created: 1698959748,
    owned_by: 'google',
    context_length: 200000,
    tokenizer: 'google',
    capabilities: {
      vision: true,
      function_calling: true,
    },
  },
]
