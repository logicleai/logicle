import { LlmModel } from '.'
import { gemini25FlashModel, gemini25ProModel, gemini30ProModel, geminiProLatest } from './vertex'

export const geminiModels: LlmModel[] = [
  {
    ...gemini25FlashModel,
    provider: 'gemini',
  },
  {
    ...gemini25ProModel,
    provider: 'gemini',
  },
  {
    ...gemini30ProModel,
    provider: 'gemini',
  },
  {
    ...geminiProLatest,
    provider: 'gemini',
  },
]
