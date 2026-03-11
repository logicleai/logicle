import { z } from 'zod'

export const tokenEstimateRequestSchema = z.object({
  conversationId: z
    .string()
    .optional()
    .describe('Conversation id used to include prior branch history in the estimate.'),
  targetMessageId: z
    .string()
    .nullish()
    .describe(
      'Optional message id that selects the target branch in a tree chat; history is linearized up to this node.'
    ),
  attachmentFileIds: z
    .array(z.string())
    .default([])
    .describe('Attachment file ids for the pending user message.'),
  draftText: z.string().default('').describe('Current draft text for the pending user message.'),
})

export type TokenEstimateRequest = z.infer<typeof tokenEstimateRequestSchema>

export const tokenEstimateResponseSchema = z.object({
  assistantId: z.string().describe('Assistant id used for estimation.'),
  model: z.string().describe('Resolved model id used for estimation.'),
  tokenizer: z
    .enum(['cl100k_base', 'o200k_base', 'approx_4chars'])
    .describe('Tokenizer strategy used to compute token estimates.'),
  estimate: z.object({
    systemPromptTokens: z
      .number()
      .describe(
        'Estimated tokens for the rendered system prompt message content, including built-in attachment guidance and tool prompt fragments.'
      ),
    knowledgeTokens: z
      .number()
      .describe(
        'Estimated tokens added by assistant knowledge injection, including prompt text and any injected knowledge message parts.'
      ),
    historyTokens: z
      .number()
      .describe(
        'Estimated tokens for prior branch messages after ChatAssistant message conversion, excluding system and knowledge injection.'
      ),
    attachmentTokens: z
      .number()
      .describe('Estimated tokens contributed by pending message attachments after message conversion.'),
    draftTextTokens: z
      .number()
      .describe('Estimated tokens contributed by the current draft text within the pending user message.'),
    baseInputTokens: z
      .number()
      .describe('Sum of systemPromptTokens + knowledgeTokens + historyTokens + attachmentTokens.'),
    totalInputTokens: z
      .number()
      .describe('Final estimate for next request input tokens: baseInputTokens + draftTextTokens.'),
  }),
})

export type TokenEstimateResponse = z.infer<typeof tokenEstimateResponseSchema>
