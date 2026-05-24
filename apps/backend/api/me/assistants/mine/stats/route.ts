import { db } from '@/db/database'
import { sql } from 'kysely'
import { ok, operation, responseSpec } from '@/lib/routes'
import { WorkspaceRole } from '@/types/workspace'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const assistantStatsSchema = z.object({
  assistantId: z.string(),
  messages: z.number(),
  likes: z.number(),
  dislikes: z.number(),
})

export const GET = operation({
  name: 'Get my assistants stats',
  description: 'Get usage and feedback stats for assistants owned by the current user.',
  authentication: 'user',
  responses: [responseSpec(200, assistantStatsSchema.array())] as const,
  implementation: async ({ session }) => {
      const editableAssistants = await db
        .selectFrom('Assistant')
        .select('id')
        .where('deleted', '=', 0)
        .where((eb) =>
          eb.or([
            eb('Assistant.owner', '=', session.userId),
            eb.exists(
              eb
                .selectFrom('AssistantSharing')
                .select('AssistantSharing.id')
                .whereRef('AssistantSharing.assistantId', '=', 'Assistant.id')
                .where('AssistantSharing.workspaceId', 'is not', null)
                .where(
                  'AssistantSharing.workspaceId',
                  'in',
                  eb
                    .selectFrom('WorkspaceMember')
                    .select('WorkspaceMember.workspaceId')
                    .where('WorkspaceMember.userId', '=', session.userId)
                    .where('WorkspaceMember.role', 'in', [WorkspaceRole.EDITOR, WorkspaceRole.OWNER, WorkspaceRole.ADMIN])
                )
            ),
          ])
        )
        .execute()

      const assistantIds = editableAssistants.map((a) => a.id)
      if (assistantIds.length === 0) return ok([])

      const msgRows = await db
        .selectFrom('Message')
        .innerJoin('Conversation', 'Conversation.id', 'Message.conversationId')
        .select('Conversation.assistantId')
        .select((eb) => eb.fn.count('Message.id').as('messages'))
        .where('Message.role', '=', 'user')
        .where('Conversation.assistantId', 'in', assistantIds)
        .groupBy('Conversation.assistantId')
        .execute()

      const fbRows = await db
        .selectFrom('MessageFeedback')
        .innerJoin('Message', 'Message.id', 'MessageFeedback.messageId')
        .innerJoin('Conversation', 'Conversation.id', 'Message.conversationId')
        .select('Conversation.assistantId')
        .select(
          sql<number>`sum(case when "MessageFeedback"."positive" = 1 then 1 else 0 end)`.as(
            'likes'
          )
        )
        .select(
          sql<number>`sum(case when "MessageFeedback"."positive" = 0 then 1 else 0 end)`.as(
            'dislikes'
          )
        )
        .where('Conversation.assistantId', 'in', assistantIds)
        .groupBy('Conversation.assistantId')
        .execute()

      const msgMap = new Map(msgRows.map((r) => [r.assistantId, Number(r.messages)]))
      const fbMap = new Map(
        fbRows.map((r) => [
          r.assistantId,
          { likes: Number(r.likes), dislikes: Number(r.dislikes) },
        ])
      )

      const stats = assistantIds.map((id) => ({
        assistantId: id,
        messages: msgMap.get(id) ?? 0,
        likes: fbMap.get(id)?.likes ?? 0,
        dislikes: fbMap.get(id)?.dislikes ?? 0,
      }))

      return ok(stats)
  },
})
