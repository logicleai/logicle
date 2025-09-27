import { LlmModel } from '.'
import { gemini25FlashModel } from './vertex'

export const geminiModels: LlmModel[] = [
  {
    ...gemini25FlashModel,
    id: 'gemini-2.5-flash',
    provider: 'gemini',
  },
]
