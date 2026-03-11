import { assistantDraftSchema } from './assistant'
import { messageSchema } from './chat'
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

export const evaluateTokenEstimateRequestSchema = z.object({
  assistant: assistantDraftSchema,
  messages: z.array(z.any()).default([]) as z.ZodType<z.infer<typeof messageSchema>[]>,
  attachmentFileIds: z
    .array(z.string())
    .default([])
    .describe('Attachment file ids for the pending user message.'),
  draftText: z.string().default('').describe('Current draft text for the pending user message.'),
})

export type EvaluateTokenEstimateRequest = z.infer<typeof evaluateTokenEstimateRequestSchema>

export const tokenEstimateResponseSchema = z.object({
  assistantId: z.string().describe('Assistant id used for estimation.'),
  model: z.string().describe('Resolved model id used for estimation.'),
  tokenizer: z
    .enum(['cl100k_base', 'o200k_base', 'approx_4chars'])
    .describe('Tokenizer strategy used to compute token estimates.'),
  estimate: z.object({
    assistant: z
      .number()
      .describe(
        'Estimated tokens for assistant-provided context before chat history, including system prompt, tool prompt fragments, and assistant knowledge injection.'
      ),
    history: z
      .number()
      .describe(
        'Estimated tokens for prior branch messages after ChatAssistant message conversion, excluding the rendered prompt context.'
      ),
    draft: z
      .number()
      .describe('Estimated tokens for the pending user message after ChatAssistant message conversion, including draft text and attachments.'),
    total: z
      .number()
      .describe('Final estimate for next request input tokens: assistant + history + draft.'),
  }),
})

export type TokenEstimateResponse = z.infer<typeof tokenEstimateResponseSchema>
