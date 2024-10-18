import { EnrichedModel } from '.'
import {
  claude35SonnetModel,
  claude3HaikuModel,
  claude3OpusModel,
  claude3SonnetModel,
} from './anthropic'
import { gpt4oMiniModel, gpt4oModel, gpt35Model } from './openai'
import { gemini15FlashModel, gemini15ProModel } from './vertex'

export const logicleModels: EnrichedModel[] = [
  gpt4oModel,
  gpt4oMiniModel,
  gpt35Model,
  claude35SonnetModel,
  claude3OpusModel,
  claude3SonnetModel,
  claude3HaikuModel,
  gemini15ProModel,
  gemini15FlashModel,
]
