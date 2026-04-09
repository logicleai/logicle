import { evaluateAssistantRequestSchema } from './chat'
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

export const assistantTokenEstimateRequestSchema = evaluateAssistantRequestSchema
export type AssistantTokenEstimateRequest = z.infer<typeof assistantTokenEstimateRequestSchema>

const tokenEstimateMetaSchema = z.object({
  assistantId: z.string().describe('Assistant id used for estimation.'),
  model: z.string().describe('Resolved model id used for estimation.'),
  tokenizer: z
    .enum(['cl100k_base', 'o200k_base', 'approx_4chars'])
    .describe('Tokenizer strategy used to compute token estimates.'),
})

export const tokenDetailPartSchema = z.object({
  type: z
    .string()
    .describe(
      'Component type: system_prompt, knowledge_text, knowledge_file, text, attachment, reasoning, tool_call, tool_result.'
    ),
  tokens: z.number().describe('Token count for this component.'),
  algorithm: z
    .string()
    .describe(
      'Algorithm or tokenizer used: cl100k_base, o200k_base, approx_4chars, native_image, pdf_native, pdf_text_fallback, pdf_page_limit_notice.'
    ),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Algorithm parameters, e.g. image dimensions or PDF page counts.'),
  id: z.string().optional().describe('File id or tool call id.'),
  name: z.string().optional().describe('File name.'),
  mimetype: z.string().optional().describe('MIME type for attachment entries.'),
  toolCallId: z.string().optional().describe('Tool call id for tool_call and tool_result entries.'),
  toolName: z.string().optional().describe('Tool name for tool_call and tool_result entries.'),
})

export type TokenDetailPart = z.infer<typeof tokenDetailPartSchema>

export const messageTokenDetailSchema = z.object({
  messageId: z.string(),
  role: z.enum(['user', 'assistant', 'tool']),
  parts: z.array(tokenDetailPartSchema),
})

export type MessageTokenDetail = z.infer<typeof messageTokenDetailSchema>

export const tokenEstimateDetailSchema = z.object({
  preamble: z
    .array(tokenDetailPartSchema)
    .describe('Per-component breakdown of preamble tokens (system prompt, knowledge).'),
  history: z
    .array(messageTokenDetailSchema)
    .describe('Per-message breakdown of history tokens.'),
  draft: z
    .array(tokenDetailPartSchema)
    .optional()
    .describe('Per-component breakdown of draft message tokens.'),
})

export type TokenEstimateDetail = z.infer<typeof tokenEstimateDetailSchema>

export const tokenEstimateResponseSchema = tokenEstimateMetaSchema.extend({
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
  detail: tokenEstimateDetailSchema.optional().describe('Detailed per-component token breakdown, present only when ?detail=true is requested.'),
})

export type TokenEstimateResponse = z.infer<typeof tokenEstimateResponseSchema>

export const assistantTokenEstimateResponseSchema = tokenEstimateMetaSchema.extend({
  estimate: z.object({
    assistant: z
      .number()
      .describe(
        'Estimated tokens for assistant-provided context before messages, including system prompt, tool prompt fragments, and assistant knowledge injection.'
      ),
    messages: z
      .number()
      .describe('Estimated tokens for the provided message list after ChatAssistant message conversion.'),
    total: z.number().describe('Final estimate for next request input tokens: assistant + messages.'),
  }),
  detail: tokenEstimateDetailSchema.optional().describe('Detailed per-component token breakdown, present only when ?detail=true is requested.'),
})

export type AssistantTokenEstimateResponse = z.infer<typeof assistantTokenEstimateResponseSchema>
