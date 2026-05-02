import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import env from '@/lib/env'
import { logger } from '@/lib/logging'
import type { ToolInvokeParams } from '@/lib/chat/tools'
import * as dto from '@/types/dto'
import { extension as mimeExtension } from 'mime-types'
import { JSONValue } from 'ai'

interface PersistFileLikeParams
  extends Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'> {
  base64Data: string
  mimeType: string
  nameHint?: string
  source: string
  supportedMedia?: string[]
}

const defaultMimeType = 'application/octet-stream'

const parseAllowedFromEnv = (): string[] => {
  const raw = env.chat.attachments.allowedFormats
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

const mimeAllowed = (mimeType: string, allowlist: string[]): boolean => {
  if (allowlist.length === 0) return true
  const normalized = mimeType.toLowerCase()
  return allowlist.some((allowed) => {
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, allowed.length - 1)
      return normalized.startsWith(prefix)
    }
    return normalized === allowed
  })
}

const makeFileName = (mimeType: string, nameHint?: string): string => {
  if (nameHint && nameHint.length > 0) return nameHint
  const ext = mimeExtension(mimeType) || 'bin'
  return `tool-output.${ext}`
}

const toFilePart = (fileEntry: {
  id: string
  type: string
  name: string
  size: number
}): Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'][number] => ({
  type: 'file',
  id: fileEntry.id,
  mimetype: fileEntry.type,
  name: fileEntry.name,
  size: fileEntry.size,
})

export const persistFileLikePayload = async (
  params: PersistFileLikeParams
): Promise<
  | { kind: 'file'; value: Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'][number] }
  | { kind: 'text'; value: Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'][number] }
> => {
  const mimeType = (params.mimeType || defaultMimeType).toLowerCase()
  const allowlist = [
    ...new Set([...(params.supportedMedia ?? []).map((m) => m.toLowerCase()), ...parseAllowedFromEnv()]),
  ]
  if (!mimeAllowed(mimeType, allowlist)) {
    logger.warn(`[${params.source}] File-like output rejected by mime allowlist`, {
      mimeType,
      allowlist,
    })
    return {
      kind: 'text',
      value: {
        type: 'text',
        text: `Tool returned unsupported file payload (${mimeType}); keeping a text fallback instead.`,
      },
    }
  }

  const bytes = Buffer.from(params.base64Data, 'base64')
  if (!bytes.length && params.base64Data.length > 0) {
    logger.warn(`[${params.source}] File-like payload is not valid base64`, { mimeType })
    return {
      kind: 'text',
      value: {
        type: 'text',
        text: `Tool returned an invalid base64 file payload (${mimeType}); keeping a text fallback instead.`,
      },
    }
  }
  if (bytes.byteLength > env.chat.attachments.maxSize) {
    logger.warn(`[${params.source}] File-like payload exceeds max size`, {
      mimeType,
      size: bytes.byteLength,
      maxSize: env.chat.attachments.maxSize,
    })
    return {
      kind: 'text',
      value: {
        type: 'text',
        text: `Tool returned a file payload too large to store (${bytes.byteLength} bytes, max ${env.chat.attachments.maxSize}).`,
      },
    }
  }

  const fileName = makeFileName(mimeType, params.nameHint)
  const { materializeFile } = await import('@/backend/lib/files/materialize')
  const dbFile = await materializeFile({
    content: bytes,
    name: fileName,
    mimeType,
    owner: resolveFileOwner(params),
  })
  return { kind: 'file', value: toFilePart(dbFile) }
}

export const normalizeMcpToolResult = async (
  result: any,
  params: Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'>
): Promise<dto.ToolCallResultOutput> => {
  const contentParts: Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'] = []
  for (const item of Array.isArray(result?.content) ? result.content : []) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      contentParts.push({ type: 'text', text: item.text })
      continue
    }
    if (item?.type === 'image' && typeof item.data === 'string') {
      const persisted = await persistFileLikePayload({
        ...params,
        base64Data: item.data,
        mimeType: item.mimeType ?? defaultMimeType,
        source: 'MCP',
      })
      contentParts.push(persisted.value)
      continue
    }
    if (item?.type === 'resource' && typeof item.resource?.blob === 'string') {
      const persisted = await persistFileLikePayload({
        ...params,
        base64Data: item.resource.blob,
        mimeType: item.resource.mimeType ?? defaultMimeType,
        nameHint: item.resource.name,
        source: 'MCP',
      })
      contentParts.push(persisted.value)
      continue
    }
    if (item?.type === 'resource' && typeof item.resource?.text === 'string') {
      contentParts.push({ type: 'text', text: item.resource.text })
      continue
    }
    contentParts.push({ type: 'text', text: JSON.stringify(item) })
  }

  if (result?.structuredContent !== undefined) {
    contentParts.push({
      type: 'text',
      text: JSON.stringify(result.structuredContent),
    })
  }

  if (contentParts.length === 0) {
    return { type: 'json', value: result as JSONValue }
  }
  return { type: 'content', value: contentParts }
}
