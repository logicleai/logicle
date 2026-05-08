import { LlmModel } from '.'
import { gemini25FlashModel, gemini25ProModel, gemini30ProModel, geminiProLatest } from './vertex'

export const geminiModels: LlmModel[] = [
  {
    ...gemini25FlashModel,
    provider: 'google-ai-studio',
  },
  {
    ...gemini25ProModel,
    provider: 'google-ai-studio',
  },
  {
    ...gemini30ProModel,
    provider: 'google-ai-studio',
  },
  {
    ...geminiProLatest,
    provider: 'google-ai-studio',
  },
]
