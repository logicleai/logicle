import {
  AudioTranscriptionInterface,
  GoogleAiStudioWebSearchInterface,
  GoogleImageGeneratorPluginInterface,
  LogicleCloudWebSearchInterface,
  ImageGeneratorPluginInterface,
  OpenAiImageGeneratorPluginInterface,
  OpenApiInterface,
  ReplicateImageGeneratorPluginInterface,
  SatelliteInterface,
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
  SatelliteInterface.toolName,
  OpenApiInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
  LogicleCloudWebSearchInterface.toolName,
  GoogleAiStudioWebSearchInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]
