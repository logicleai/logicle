import { LlmModel } from '.'
import {
  claude35HaikuModel,
  claude35SonnetModel,
  claude37SonnetModel,
  claude3HaikuModel,
  claude3OpusModel,
  claude3SonnetModel,
  claude4OpusModel,
  claude4SonnetModel,
} from './anthropic'
import {
  gpt4oMiniModel,
  gpt4oModel,
  gpt35Model,
  o1MiniModel,
  o1Model,
  o3MiniModel,
  o4MiniModel,
  gpt41Model,
  o3Model,
  gpt41MiniModel,
} from './openai'
import { perplexityModels } from './perplexity'
import {
  gemini15FlashModel,
  gemini15ProModel,
  gemini20FlashLiteModel,
  gemini20FlashModel,
  gemini20ProModel,
  gemini25ProModel,
  gemini25FlashModel,
} from './vertex'

export const logicleModels: LlmModel[] = [
  gpt41Model,
  gpt41MiniModel,
  gpt4oModel,
  gpt4oMiniModel,
  gpt35Model,
  o1Model,
  o1MiniModel,
  o3Model,
  o3MiniModel,
  o4MiniModel,
  { ...claude35SonnetModel, id: 'claude-3-5-sonnet' },
  { ...claude35HaikuModel, id: 'claude-3-5-haiku' },
  { ...claude3OpusModel, id: 'claude-3-opus' },
  { ...claude37SonnetModel, id: 'claude-3-7-sonnet' },
  { ...claude4SonnetModel, id: 'claude-sonnet-4' },
  { ...claude4OpusModel, id: 'claude-opus-4' },
  claude3SonnetModel,
  claude3HaikuModel,
  gemini15ProModel,
  gemini15FlashModel,
  gemini20ProModel,
  gemini20FlashModel,
  gemini20FlashLiteModel,
  gemini25ProModel,
  { ...gemini25FlashModel, id: 'gemini-2.5-flash' },
  ...perplexityModels,
].map((model) => {
  return {
    ...model,
    provider: 'logiclecloud',
  }
})
