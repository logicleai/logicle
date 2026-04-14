import { z } from 'zod'
import {
  AnthropicWebSearchInterface,
  AnthropicWebSearchSchema,
  AudioTranscriptionInterface,
  AudioTranscriptionSchema,
  CodeInterpreterInterface,
  CodeInterpreterSchema,
  DummyToolInterface,
  DummyToolSchema,
  FileManagerPluginInterface,
  FileManagerPluginSchema,
  GoogleImageGeneratorPluginInterface,
  GoogleWebSearchInterface,
  GoogleWebSearchSchema,
  DirectImageGeneratorSchema,
  ImageGeneratorPluginInterface,
  ImageGeneratorSchema,
  McpInterface,
  mcpPluginSchema,
  NativeToolInterface,
  NativeToolSchema,
  OpenAiImageGenerationInterface,
  OpenAiImageGenerationSchema,
  OpenAiImageGeneratorPluginInterface,
  OpenAiWebSearchInterface,
  OpenAiWebSearchSchema,
  OpenApiInterface,
  OpenApiSchema,
  ReplicateImageGeneratorSchema,
  ReplicateImageGeneratorPluginInterface,
  RouterInterface,
  RouterSchema,
  TimeOfDayInterface,
  TimeOfDaySchema,
  TogetherImageGeneratorPluginInterface,
  WebSearchInterface,
  WebSearchSchema,
} from '@/lib/tools/schemas'

export type ToolSchemaRegistryEntry = {
  toolName: string
  schema: z.ZodType<Record<string, unknown>>
}

export const toolSchemaRegistry: Record<string, ToolSchemaRegistryEntry> = {
  [AudioTranscriptionInterface.toolName]: {
    toolName: AudioTranscriptionInterface.toolName,
    schema: AudioTranscriptionSchema,
  },
  [ImageGeneratorPluginInterface.toolName]: {
    toolName: ImageGeneratorPluginInterface.toolName,
    schema: ImageGeneratorSchema,
  },
  [OpenAiImageGeneratorPluginInterface.toolName]: {
    toolName: OpenAiImageGeneratorPluginInterface.toolName,
    schema: DirectImageGeneratorSchema,
  },
  [GoogleImageGeneratorPluginInterface.toolName]: {
    toolName: GoogleImageGeneratorPluginInterface.toolName,
    schema: DirectImageGeneratorSchema,
  },
  [TogetherImageGeneratorPluginInterface.toolName]: {
    toolName: TogetherImageGeneratorPluginInterface.toolName,
    schema: DirectImageGeneratorSchema,
  },
  [ReplicateImageGeneratorPluginInterface.toolName]: {
    toolName: ReplicateImageGeneratorPluginInterface.toolName,
    schema: ReplicateImageGeneratorSchema,
  },
  [FileManagerPluginInterface.toolName]: {
    toolName: FileManagerPluginInterface.toolName,
    schema: FileManagerPluginSchema,
  },
  [OpenApiInterface.toolName]: {
    toolName: OpenApiInterface.toolName,
    schema: OpenApiSchema,
  },
  [McpInterface.toolName]: {
    toolName: McpInterface.toolName,
    schema: mcpPluginSchema,
  },
  [NativeToolInterface.toolName]: {
    toolName: NativeToolInterface.toolName,
    schema: NativeToolSchema,
  },
  [RouterInterface.toolName]: {
    toolName: RouterInterface.toolName,
    schema: RouterSchema,
  },
  [TimeOfDayInterface.toolName]: {
    toolName: TimeOfDayInterface.toolName,
    schema: TimeOfDaySchema,
  },
  [WebSearchInterface.toolName]: {
    toolName: WebSearchInterface.toolName,
    schema: WebSearchSchema,
  },
  [DummyToolInterface.toolName]: {
    toolName: DummyToolInterface.toolName,
    schema: DummyToolSchema,
  },
  [AnthropicWebSearchInterface.toolName]: {
    toolName: AnthropicWebSearchInterface.toolName,
    schema: AnthropicWebSearchSchema,
  },
  [OpenAiWebSearchInterface.toolName]: {
    toolName: OpenAiWebSearchInterface.toolName,
    schema: OpenAiWebSearchSchema,
  },
  [GoogleWebSearchInterface.toolName]: {
    toolName: GoogleWebSearchInterface.toolName,
    schema: GoogleWebSearchSchema,
  },
  [CodeInterpreterInterface.toolName]: {
    toolName: CodeInterpreterInterface.toolName,
    schema: CodeInterpreterSchema,
  },
  [OpenAiImageGenerationInterface.toolName]: {
    toolName: OpenAiImageGenerationInterface.toolName,
    schema: OpenAiImageGenerationSchema,
  },
}
