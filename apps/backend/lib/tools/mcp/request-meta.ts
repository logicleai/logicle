import { db } from '@/db/database'
import { logger } from '@/lib/logging'
import type { ToolInvokeParams } from '@/lib/chat/tools'

const META_PREFIX = 'logicle/'

export interface McpWorkspaceMembership {
  workspaceId: string
  role: string
}

// Memberships are limited to workspaces the invoking assistant is shared with,
// intersected with the user's current memberships, to minimize disclosure.
const computeMemberships = async (
  assistantId: string,
  userId: string
): Promise<McpWorkspaceMembership[]> => {
  const rows = await db
    .selectFrom('WorkspaceMember')
    .innerJoin('AssistantSharing', 'AssistantSharing.workspaceId', 'WorkspaceMember.workspaceId')
    .select(['WorkspaceMember.workspaceId as workspaceId', 'WorkspaceMember.role as role'])
    .where('WorkspaceMember.userId', '=', userId)
    .where('AssistantSharing.assistantId', '=', assistantId)
    .execute()
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.workspaceId) ? false : (seen.add(r.workspaceId), true)))
}

/**
 * Builds the optional per-request `_meta` sent with MCP tools/call.
 * Every field is independent and optional; failures never block the call.
 */
export const buildMcpRequestMeta = async (
  invokeParams: Pick<ToolInvokeParams, 'conversationId' | 'messages' | 'assistantId' | 'userId'>
): Promise<Record<string, unknown>> => {
  const meta: Record<string, unknown> = {}
  const { conversationId, messages, assistantId, userId } = invokeParams
  if (conversationId) meta[`${META_PREFIX}conversationId`] = conversationId
  const lastUserMessage = [...(messages ?? [])].reverse().find((m) => m.role === 'user')
  if (lastUserMessage) meta[`${META_PREFIX}messageId`] = lastUserMessage.id
  if (userId) {
    meta[`${META_PREFIX}userId`] = userId
    try {
      meta[`${META_PREFIX}workspaceMemberships`] = await computeMemberships(assistantId, userId)
    } catch (e) {
      logger.warn('Failed computing MCP workspace memberships', e)
    }
  }
  return meta
}
