import { ok, operation, responseSpec } from '@/lib/routes'
import { getEnvironmentPayload } from '@/lib/app-config'
import type { LlmModel, EngineOwner } from '@/lib/chat/models'
import type { ProviderType } from '@/types/provider'
import { parameterSchema } from '@/types/dto'
import { z } from 'zod'

const llmModelSchema: z.ZodType<LlmModel> = z.object({
  id: z.string(),
  model: z.string(),
  name: z.string(),
  provider: z.string() as unknown as z.ZodType<ProviderType>,
  owned_by: z.string() as unknown as z.ZodType<EngineOwner>,
  description: z.string(),
  context_length: z.number(),
  capabilities: z.object({
    vision: z.boolean(),
    function_calling: z.boolean(),
    supportedMedia: z.array(z.string()).optional(),
    web_search: z.boolean().optional(),
    knowledge: z.boolean().optional(),
    nativePdfPageLimit: z.number().optional(),
    promptCaching: z.boolean().optional(),
    temperature: z.boolean().optional(),
  }),
  defaultReasoning: z.string().optional() as unknown as z.ZodType<LlmModel['defaultReasoning']>,
  supportedReasoningEfforts: z.array(z.string()).optional() as unknown as z.ZodType<
    LlmModel['supportedReasoningEfforts']
  >,
  tags: z.array(z.string()).optional() as unknown as z.ZodType<LlmModel['tags']>,
  maxOutputTokens: z.number().optional(),
  tokenizer: z.string().optional() as unknown as z.ZodType<LlmModel['tokenizer']>,
})

const environmentResponseSchema = z.object({
  appUrl: z.string(),
  appVersion: z.string(),
  appDisplayName: z.string(),
  backendConfigLock: z.boolean(),
  ssoConfigLock: z.boolean(),
  enableSignup: z.boolean(),
  enableAutoSummary: z.boolean(),
  enableApiKeysUi: z.boolean(),
  enableSatellitesUi: z.boolean(),
  enableChatSharing: z.boolean(),
  enableChatFolders: z.boolean(),
  enableShowToolResult: z.boolean(),
  enableChatTreeNavigation: z.boolean(),
  enableAssistantInfo: z.boolean(),
  enableAssistantDuplicate: z.boolean(),
  maxImgAttachmentDimPx: z.number(),
  maxAttachmentSize: z.number(),
  sessionRefreshIntervalMinutes: z.number(),
  sessionRefreshThrottleMinutes: z.number(),
  softMessageLimit: z.number().optional(),
  hardMessageLimit: z.number().optional(),
  models: z.array(llmModelSchema),
  parameters: z.array(parameterSchema),
  faviconPath: z.string().optional(),
  logoPath: z.string().optional(),
})

// Also called in-process (getEnvironmentPayload) by server.ts, which injects
// this same payload into the statically exported HTML shell on each request.
export const GET = operation({
  name: 'Get environment',
  description: 'Bootstrap configuration consumed by the frontend on startup.',
  authentication: 'public',
  responses: [responseSpec(200, environmentResponseSchema)] as const,
  implementation: async () => {
    return ok(await getEnvironmentPayload())
  },
})
