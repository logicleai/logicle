import { LlmModel } from '.'
import { gemini25FlashModel, gemini25ProModel } from './vertex'

export const geminiModels: LlmModel[] = [
  {
    ...gemini25FlashModel,
    id: 'gemini-2.5-flash',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
  },
  {
    ...gemini25ProModel,
    id: 'gemini-2.5-pro',
    model: 'gemini-2.5-pro',
    provider: 'gemini',
  },
]
