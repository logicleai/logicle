import { LlmModel } from '.'
import {
  gemini25FlashModel,
  gemini25ProModel,
  gemini30ProModel,
  gemini31FlashLite,
  gemini31ProModel,
  gemini35FlashModel,
  gemini36FlashModel,
  gemini37FlashModel,
  geminiFlashLatest,
  geminiProLatest,
} from './vertex'

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
    ...gemini31FlashLite,
    provider: 'google-ai-studio',
  },
  {
    ...gemini31ProModel,
    provider: 'google-ai-studio',
  },
  {
    ...gemini35FlashModel,
    provider: 'google-ai-studio',
  },
  {
    ...gemini36FlashModel,
    provider: 'google-ai-studio',
  },
  {
    ...gemini37FlashModel,
    provider: 'google-ai-studio',
  },
  {
    ...geminiProLatest,
    provider: 'google-ai-studio',
  },
  {
    ...geminiFlashLatest,
    provider: 'google-ai-studio',
  },
]
