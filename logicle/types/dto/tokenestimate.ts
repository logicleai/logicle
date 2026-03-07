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
  includeKnowledge: z
    .boolean()
    .default(true)
    .describe('Whether assistant knowledge prompt text is included in the estimate.'),
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
      .describe('Estimated tokens for the assistant system prompt text only.'),
    knowledgeTokens: z
      .number()
      .describe('Estimated tokens for rendered assistant knowledge prompt text.'),
    historyTokens: z
      .number()
      .describe(
        'Estimated tokens for prior branch messages, including user text, assistant text parts, and historical user attachments.'
      ),
    attachmentTokens: z
      .number()
      .describe('Estimated tokens contributed by pending message attachments.'),
    draftTextTokens: z.number().describe('Estimated tokens for the current draft text being sent.'),
    baseInputTokens: z
      .number()
      .describe('Sum of systemPromptTokens + knowledgeTokens + historyTokens + attachmentTokens.'),
    totalInputTokens: z
      .number()
      .describe('Final estimate for next request input tokens: baseInputTokens + draftTextTokens.'),
  }),
})

export type TokenEstimateResponse = z.infer<typeof tokenEstimateResponseSchema>
