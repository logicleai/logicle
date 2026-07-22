import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import { logger } from '@/lib/logging'
import type { ToolInvokeParams } from '@/lib/chat/tools'
import * as dto from '@/types/dto'
import { extension as mimeExtension } from 'mime-types'
import { JSONValue } from 'ai'

interface PersistFileLikeParams
  extends Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'> {
  content: Buffer | Uint8Array
  mimeType: string
  nameHint?: string
  source: string
}

const defaultMimeType = 'application/octet-stream'

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

export const saveFile = async (
  params: PersistFileLikeParams
): Promise<Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'][number]> => {
  const mimeType = (params.mimeType || defaultMimeType).toLowerCase()
  const bytes = Buffer.from(params.content)
  const fileName = makeFileName(mimeType, params.nameHint)
  const { materializeFile } = await import('@/backend/lib/files/materialize')
  const dbFile = await materializeFile({
    content: bytes,
    name: fileName,
    mimeType,
    owner: resolveFileOwner(params),
  })
  logger.debug(`[${params.source}] Persisted file-like payload`, { mimeType, size: bytes.byteLength, name: fileName })
  return toFilePart({
    id: dbFile.id,
    type: dbFile.type,
    name: dbFile.name,
    size: dbFile.size ?? bytes.byteLength,
  })
}

type ReadResourceFn = (uri: string) => Promise<{ blob?: string; text?: string; mimeType?: string } | undefined>

interface NormalizeMcpOptions {
  readResource?: ReadResourceFn
  resolveResourceLinks?: boolean
}

export const normalizeMcpToolResult = async (
  result: any,
  params: Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'>,
  options: NormalizeMcpOptions = {}
): Promise<dto.ToolCallResultOutput> => {
  const { readResource, resolveResourceLinks = true } = options
  const contentParts: Extract<dto.ToolCallResultOutput, { type: 'content' }>['value'] = []
  for (const item of Array.isArray(result?.content) ? result.content : []) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      contentParts.push({ type: 'text', text: item.text })
      continue
    }
    if (item?.type === 'image' && typeof item.data === 'string') {
      const persisted = await saveFile({
        ...params,
        content: Buffer.from(item.data, 'base64'),
        mimeType: item.mimeType ?? defaultMimeType,
        source: 'MCP',
      })
      contentParts.push(persisted)
      continue
    }
    if (item?.type === 'resource_link' && typeof item.uri === 'string') {
      if (resolveResourceLinks && readResource) {
        try {
          const contents = await readResource(item.uri)
          if (contents?.blob) {
            const persisted = await saveFile({
              ...params,
              content: Buffer.from(contents.blob, 'base64'),
              mimeType: contents.mimeType ?? item.mimeType ?? defaultMimeType,
              nameHint: item.name,
              source: 'MCP',
            })
            contentParts.push(persisted)
            continue
          }
          if (contents?.text !== undefined) {
            contentParts.push({ type: 'text', text: contents.text })
            continue
          }
        } catch (e) {
          logger.warn(`Failed to resolve MCP resource_link ${item.uri}`, e)
        }
      }
    }
    if (item?.type === 'resource' && typeof item.resource?.blob === 'string') {
      const persisted = await saveFile({
        ...params,
        content: Buffer.from(item.resource.blob, 'base64'),
        mimeType: item.resource.mimeType ?? defaultMimeType,
        nameHint: item.resource.name ?? item.resource.uri,
        source: 'MCP',
      })
      contentParts.push(persisted)
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
