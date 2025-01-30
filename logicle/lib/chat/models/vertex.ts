import { EnrichedModel } from '.'

export const gemini15ProModel: EnrichedModel = {
  name: 'Gemini 1.5 Pro',
  description: 'Vertex',
  id: 'gemini-1.5-pro',
  owned_by: 'google',
  context_length: 2000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}
export const gemini15FlashModel: EnrichedModel = {
  name: 'Gemini 1.5 Flash',
  description: 'Vertex',
  id: 'gemini-1.5-flash',
  owned_by: 'google',
  context_length: 1000000,
  capabilities: {
    vision: true,
    function_calling: true,
  },
}

export const vertexModels: EnrichedModel[] = [gemini15ProModel, gemini15FlashModel]
