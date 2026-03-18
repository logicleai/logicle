import { z } from 'zod'
import {
  AnthropicWebSearchInterface,
  AnthropicWebSearchSchema,
  DummyToolInterface,
  DummyToolSchema,
  FileManagerPluginInterface,
  FileManagerPluginSchema,
  GoogleWebSearchInterface,
  GoogleWebSearchSchema,
  ImageGeneratorPluginInterface,
  ImageGeneratorSchema,
  McpInterface,
  mcpPluginSchema,
  NativeToolInterface,
  NativeToolSchema,
  OpenAiCodeInterpreterInterface,
  OpenAiCodeInterpreterSchema,
  OpenAiImageGenerationInterface,
  OpenAiImageGenerationSchema,
  OpenAiWebSearchInterface,
  OpenAiWebSearchSchema,
  OpenApiInterface,
  OpenApiSchema,
  RouterInterface,
  RouterSchema,
  TimeOfDayInterface,
  TimeOfDaySchema,
  WebSearchInterface,
  WebSearchSchema,
} from './schemas'

export type ToolSchemaRegistryEntry = {
  toolName: string
  schema: z.ZodType<Record<string, unknown>>
}

export const toolSchemaRegistry: Record<string, ToolSchemaRegistryEntry> = {
  [ImageGeneratorPluginInterface.toolName]: {
    toolName: ImageGeneratorPluginInterface.toolName,
    schema: ImageGeneratorSchema,
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
  [OpenAiCodeInterpreterInterface.toolName]: {
    toolName: OpenAiCodeInterpreterInterface.toolName,
    schema: OpenAiCodeInterpreterSchema,
  },
  [OpenAiImageGenerationInterface.toolName]: {
    toolName: OpenAiImageGenerationInterface.toolName,
    schema: OpenAiImageGenerationSchema,
  },
}
