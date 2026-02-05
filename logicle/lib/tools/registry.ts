import { z } from 'zod'
import { ImageGeneratorSchema, ImageGeneratorPluginInterface } from './imagegenerator/interface'
import { FileManagerPluginInterface, FileManagerPluginSchema } from './retrieve-file/interface'
import { OpenApiInterface, OpenApiSchema } from './openapi/interface'
import { McpInterface, mcpPluginSchema } from './mcp/interface'
import { NativeToolInterface, NativeToolSchema } from './nativetool/interface'
import { RouterInterface, RouterSchema } from './router/interface'
import { TimeOfDayInterface, TimeOfDaySchema } from './timeofday/interface'
import { WebSearchInterface, WebSearchSchema } from './websearch/interface'
import { DummyToolInterface, DummyToolSchema } from './dummy/interface'
import { AnthropicWebSearchInterface, AnthropicWebSearchSchema } from './anthropic.web_search/interface'
import { OpenAiWebSearchInterface, OpenAiWebSearchSchema } from './openai.web_search/interface'
import { GoogleWebSearchInterface, GoogleWebSearchSchema } from './google.web_search/interface'
import { OpenAiCodeInterpreterInterface, OpenAiCodeInterpreterSchema } from './openai.code_interpreter/interface'
import { OpenAiImageGenerationInterface, OpenAiImageGenerationSchema } from './openai.image_generation/interface'
import { IsolatedVmInterface, IsolatedVmSchema } from './isolated-vm/interface'

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
  [IsolatedVmInterface.toolName]: {
    toolName: IsolatedVmInterface.toolName,
    schema: IsolatedVmSchema,
  },
}
