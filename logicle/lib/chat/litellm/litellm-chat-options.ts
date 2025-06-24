import { z } from 'zod'

export type LiteLlmChatModelId = string
export type OpenAICompatibleChatModelId = string

export const liteLlmProviderOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
})

export type LiteLlmProviderOptions = z.infer<typeof liteLlmProviderOptions>
