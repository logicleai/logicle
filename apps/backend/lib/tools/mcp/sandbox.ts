import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { McpStdioPluginParams } from '@/lib/tools/schemas'

const safeSegment = (value: string, label: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid MCP sandbox ${label}`)
  return value
}

export type McpConversationSandbox = {
  workspaceDir: string
  conversationId: string
  userId: string
}

/** Creates process-local state directories. File bytes stay in Logicle storage and
 * are fetched on demand over the dedicated file bridge instead of being staged. */
export const prepareMcpConversationSandbox = async (
  config: McpStdioPluginParams,
  conversationId: string,
  userId: string
): Promise<McpConversationSandbox | undefined> => {
  if (!config.sandbox) return undefined
  const workspaceDir = path.join(config.sandbox.root, safeSegment(conversationId, 'conversation id'))
  await Promise.all([
    mkdir(path.join(workspaceDir, 'home'), { recursive: true, mode: 0o700 }),
    mkdir(path.join(workspaceDir, 'tmp'), { recursive: true, mode: 0o700 }),
  ])
  return { workspaceDir, conversationId, userId }
}
