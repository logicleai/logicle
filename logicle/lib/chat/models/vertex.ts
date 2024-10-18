import { EnrichedModel } from '.'

export const gemini15ProModel = {
  name: 'gemini-1.5-pro',
  description: 'Vertex',
  id: 'gemini-1.5-pro',
  created: 1698959748,
  owned_by: 'google',
  context_length: 2000000,
  tokenizer: 'google',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}
export const gemini15FlashModel = {
  name: 'gemini-1.5-flash',
  description: 'Vertex',
  id: 'gemini-1.5-flash',
  created: 1698959748,
  owned_by: 'google',
  context_length: 1000000,
  tokenizer: 'google',
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const vertexModels: EnrichedModel[] = [gemini15ProModel, gemini15FlashModel]
