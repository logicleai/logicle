import {
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

export const toolNames = [
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
