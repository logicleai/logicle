import { LlmModel } from '.'
import {
  claude35HaikuModel,
  claude35SonnetModel,
  claude3HaikuModel,
  claude3OpusModel,
  claude3SonnetModel,
} from './anthropic'
import { gpt4oMiniModel, gpt4oModel, gpt35Model, o1MiniModel, o1Model, o3MiniModel } from './openai'
import { sonarModel, sonarProModel } from './perplexity'
import { vertexModels } from './vertex'

export const logicleModels: LlmModel[] = [
  gpt4oModel,
  gpt4oMiniModel,
  gpt35Model,
  o1Model,
  o1MiniModel,
  o3MiniModel,
  { ...claude35SonnetModel, id: 'claude-3-5-sonnet' },
  { ...claude35HaikuModel, id: 'claude-3-5-haiku' },
  { ...claude3OpusModel, id: 'claude-3-opus' },
  claude3SonnetModel,
  claude3HaikuModel,
  ...vertexModels,
  sonarModel,
  sonarProModel,
]
