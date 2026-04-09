import { db } from '@/db/database'
import { renderDocxFromMarkdown } from '@/backend/lib/docx/export'
import { notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const POST = operation({
  name: 'Export shared conversation markdown to DOCX',
  description: 'Render markdown into a DOCX document for a shared conversation preview.',
  authentication: 'user',
  requestBodySchema: dto.conversationDocxExportRequestSchema,
  responses: [responseSpec(200, z.any()), errorSpec(404)] as const,
  implementation: async ({ params, body }) => {
    const sharedConversation = await db
      .selectFrom('ConversationSharing')
      .select('id')
      .where('ConversationSharing.id', '=', params.shareId)
      .executeTakeFirst()

    if (!sharedConversation) {
      return notFound(`No shared conversation with id ${params.shareId}`)
    }

    const doc = await renderDocxFromMarkdown(body.markdown)
    return new Response(Buffer.from(doc), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': 'attachment; filename="message.docx"',
      },
    })
  },
})
