import {
  AudioTranscriptionInterface,
  FileManagerPluginInterface,
  GoogleImageGeneratorPluginInterface,
  ImageGeneratorPluginInterface,
  OpenAiImageGeneratorPluginInterface,
  OpenApiInterface,
  ReplicateImageGeneratorPluginInterface,
  TimeOfDayInterface,
  TogetherImageGeneratorPluginInterface,
  WebSearchInterface,
} from './schemas'

export const imageGenToolNames = new Set([
  ImageGeneratorPluginInterface.toolName,
  OpenAiImageGeneratorPluginInterface.toolName,
  GoogleImageGeneratorPluginInterface.toolName,
  TogetherImageGeneratorPluginInterface.toolName,
  ReplicateImageGeneratorPluginInterface.toolName,
])

export const toolNames = [
  AudioTranscriptionInterface.toolName,
  ImageGeneratorPluginInterface.toolName,
  OpenAiImageGeneratorPluginInterface.toolName,
  GoogleImageGeneratorPluginInterface.toolName,
  TogetherImageGeneratorPluginInterface.toolName,
  ReplicateImageGeneratorPluginInterface.toolName,
  OpenApiInterface.toolName,
  FileManagerPluginInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]
