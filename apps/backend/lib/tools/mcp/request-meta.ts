import { db } from '@/db/database'
import { logger } from '@/lib/logging'
import type { ToolInvokeParams } from '@/lib/chat/tools'
import { WorkspaceRole } from '@/types/workspace'

const META_PREFIX = 'custom/'
const META_FIELDS = [
  'conversationId',
  'messageId',
  'userId',
  'userName',
  'workspaceMemberships',
] as const

export interface McpWorkspaceMembership {
  workspaceId: string
  workspaceName: string
  role: WorkspaceRole
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
    .innerJoin('Workspace', 'Workspace.id', 'WorkspaceMember.workspaceId')
    .select([
      'WorkspaceMember.workspaceId as workspaceId',
      'Workspace.name as workspaceName',
      'WorkspaceMember.role as role',
    ])
    .where('WorkspaceMember.userId', '=', userId)
    .where('AssistantSharing.assistantId', '=', assistantId)
    .execute()
  const seen = new Set<string>()
  return rows
    .filter(
      (row) =>
        row.workspaceId.trim() &&
        row.workspaceName.trim() &&
        Object.values(WorkspaceRole).includes(row.role)
    )
    .filter((row) => {
      if (seen.has(row.workspaceId)) return false
      seen.add(row.workspaceId)
      return true
    })
    .map((row) => ({ ...row, workspaceName: row.workspaceName.trim() }))
}

/**
 * Builds the optional per-request `_meta` sent with MCP tools/call.
 * Every field is independent and optional; failures never block the call.
 */
export const buildMcpRequestMeta = async (
  invokeParams: Pick<
    ToolInvokeParams,
    'conversationId' | 'assistantId' | 'userId' | 'requestContext' | 'requestMeta'
  >
): Promise<Record<string, unknown>> => {
  const meta: Record<string, unknown> = { ...invokeParams.requestMeta }
  for (const field of META_FIELDS) delete meta[`${META_PREFIX}${field}`]
  const { assistantId } = invokeParams
  const conversationId = invokeParams.requestContext?.conversationId ?? invokeParams.conversationId
  const messageId = invokeParams.requestContext?.messageId
  const userId = invokeParams.requestContext?.userId ?? invokeParams.userId
  if (conversationId) meta[`${META_PREFIX}conversationId`] = conversationId
  if (messageId) meta[`${META_PREFIX}messageId`] = messageId
  if (userId) {
    meta[`${META_PREFIX}userId`] = userId
    try {
      const user = await db
        .selectFrom('User')
        .select('name')
        .where('id', '=', userId)
        .executeTakeFirst()
      if (user?.name.trim()) meta[`${META_PREFIX}userName`] = user.name.trim()
    } catch (e) {
      logger.warn('Failed computing MCP user name', e)
    }
    try {
      if (assistantId) {
        const memberships = await computeMemberships(assistantId, userId)
        if (memberships.length > 0) meta[`${META_PREFIX}workspaceMemberships`] = memberships
      }
    } catch (e) {
      logger.warn('Failed computing MCP workspace memberships', e)
    }
  }
  return meta
}
