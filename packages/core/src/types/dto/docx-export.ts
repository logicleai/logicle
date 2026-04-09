import { z } from 'zod'

export const conversationDocxExportRequestSchema = z.object({
  markdown: z.string().describe('Markdown content to render into a DOCX document.'),
})

export type ConversationDocxExportRequest = z.infer<typeof conversationDocxExportRequestSchema>
