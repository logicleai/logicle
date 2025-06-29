import { z } from 'zod'

export type LitellmChatModelId = string

export const litellmProviderOptions = z.object({
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

export type LitellmProviderOptions = z.infer<typeof litellmProviderOptions>
