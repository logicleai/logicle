import * as z from 'zod'

export const AnthropicWebSearchSchema = z.object({}).strict()
export type AnthropicWebSearchParams = z.infer<typeof AnthropicWebSearchSchema>
export class AnthropicWebSearchInterface {
  static toolName = 'anthropic.web_search'
}

export const dummyToolFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
})
export const DummyToolSchema = z.object({
  files: z.array(dummyToolFileSchema).optional().default([]),
})
export type DummyToolParams = z.infer<typeof DummyToolSchema>
export type DummyToolFile = z.infer<typeof dummyToolFileSchema>
export class DummyToolInterface {
  static toolName = 'dummy'
}

export const GoogleWebSearchSchema = z.object({}).strict()
export type GoogleWebSearchParams = z.infer<typeof GoogleWebSearchSchema>
export class GoogleWebSearchInterface {
  static toolName = 'google.web_search'
}

export const ImageGeneratorSchema = z.object({
  apiKey: z.string().describe('secret'),
  model: z.string(),
  supportsEditing: z.boolean().default(false),
})
export type ImageGeneratorPluginParams = z.infer<typeof ImageGeneratorSchema>
export const DirectImageGeneratorSchema = ImageGeneratorSchema
export type DirectImageGeneratorPluginParams = z.infer<typeof DirectImageGeneratorSchema>
export const ReplicateImageGeneratorSchema = z.object({
  apiKey: z.string().describe('secret'),
  model: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  supportsEditing: z.boolean().default(false),
})
export type ReplicateImageGeneratorPluginParams = z.infer<typeof ReplicateImageGeneratorSchema>
export class ImageGeneratorPluginInterface {
  static toolName = 'dall-e'
}
export class OpenAiImageGeneratorPluginInterface {
  static toolName = 'imagegen.openai'
}
export class GoogleImageGeneratorPluginInterface {
  static toolName = 'imagegen.google'
}
export class TogetherImageGeneratorPluginInterface {
  static toolName = 'imagegen.together'
}
export class ReplicateImageGeneratorPluginInterface {
  static toolName = 'imagegen.replicate'
}

export const KnowledgePluginSchema = z.object({}).strict()
export type KnowledgePluginParams = z.infer<typeof KnowledgePluginSchema>
export class KnowledgePluginInterface {
  static toolName = 'file-manager'
}

export const mcpAuthenticationSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('none'),
    }),
    z.object({
      type: z.literal('bearer'),
      bearerToken: z.string(),
    }),
    z.object({
      type: z.literal('oauth'),
      clientId: z.preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z.string().min(1).optional()
      ),
      clientSecret: z.string().optional().describe('secret'),
      preferTopLevelNavigation: z.boolean().optional().default(false),
      activationMode: z.enum(['preflight', 'lazy']).optional().default('preflight'),
    }),
  ])
  .default({ type: 'none' })

export const mcpPluginSchema = z.object({
  url: z.string().url(),
  authentication: mcpAuthenticationSchema,
})
export type McpPluginAuthentication = z.infer<typeof mcpAuthenticationSchema>
export type McpPluginParams = z.infer<typeof mcpPluginSchema>
export class McpInterface {
  static toolName = 'mcp'
}

export type McpToolAvailability = 'ok' | 'require-auth'

const normalizeMcpConfig = (config: unknown) => {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config)
    } catch {
      return undefined
    }
  }
  return config
}

export const getMcpToolAvailability = (
  config: unknown,
  hasReadableSecret: boolean
): McpToolAvailability => {
  const parsed = mcpPluginSchema.safeParse(normalizeMcpConfig(config))
  if (!parsed.success) {
    return 'require-auth'
  }
  if (parsed.data.authentication.type !== 'oauth') {
    return 'ok'
  }
  return hasReadableSecret ? 'ok' : 'require-auth'
}

export const NativeToolSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  args: z.record(z.string(), z.any()).optional(),
})
export type NativeToolParams = z.infer<typeof NativeToolSchema>
export class NativeToolInterface {
  static toolName = 'native'
}

const executionModeSchema = z
  .object({
    mode: z.literal('tool').default('tool'),
    model: z.string().optional(),
    apiKey: z.string().describe('secret'),
  })
  .strict()

export const CodeInterpreterSchema = z
  .object({
    apiBaseUrl: z.string().optional(),
    executionMode: executionModeSchema,
  })
  .strict()
export type CodeInterpreterParams = z.infer<typeof CodeInterpreterSchema>
export class CodeInterpreterInterface {
  static toolName = 'code_interpreter'
}

export const OpenAiImageGenerationSchema = z.object({}).strict()
export type OpenAiImageGenerationParams = z.infer<typeof OpenAiImageGenerationSchema>
export class OpenAiImageGenerationInterface {
  static toolName = 'openai.image_generation'
}

export const OpenAiWebSearchSchema = z.object({}).strict()
export type OpenAiWebSearchParams = z.infer<typeof OpenAiWebSearchSchema>
export class OpenAiWebSearchInterface {
  static toolName = 'openai.web_search'
}

export const OpenApiSchema = z.object({
  spec: z.string(),
})
export type OpenApiParams = z.infer<typeof OpenApiSchema>
export class OpenApiInterface {
  static toolName = 'openapi'
}

export const FileManagerPluginSchema = z.object({}).strict()
export type FileManagerPluginParams = z.infer<typeof FileManagerPluginSchema>
export class FileManagerPluginInterface {
  static toolName = 'file-manager'
}

export const RestrictionsSchema = z.object({
  models: z.array(z.string()).optional(),
})
export const RouterChoiceSchema = z.object({
  type: z.string(),
  configuration: z.record(z.string(), z.any()),
  restrictions: RestrictionsSchema.optional(),
})
export const RouterSchema = z.object({
  choices: z.array(RouterChoiceSchema),
})
export type Restrictions = z.infer<typeof RestrictionsSchema>
export type RouterParams = z.infer<typeof RouterSchema>
export class RouterInterface {
  static toolName = 'router'
}

export const TimeOfDaySchema = z.object({}).strict()
export type TimeOfDayParams = z.infer<typeof TimeOfDaySchema>
export class TimeOfDayInterface {
  static toolName = 'timeofday'
}

export const WebSearchSchema = z.object({
  apiKey: z.string().describe('secret'),
  apiUrl: z.string().nullable().default(null),
})
export type WebSearchParams = z.infer<typeof WebSearchSchema>
export class WebSearchInterface {
  static toolName = 'websearch'
}
