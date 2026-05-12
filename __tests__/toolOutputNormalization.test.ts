import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'

const materializedByHash = new Map<
  string,
  { id: string; type: string; name: string; size: number }
>()
const materializeCalls: Array<{
  owner: { ownerType: string; ownerId: string }
}> = []

vi.mock('@/backend/lib/files/materialize', () => ({
  materializeFile: vi.fn(
    async (params: {
      content: Buffer
      name: string
      mimeType: string
      owner: { ownerType: string; ownerId: string }
    }) => {
      materializeCalls.push({ owner: params.owner })
      const hash = createHash('sha256').update(params.content).digest('hex')
      const existing = materializedByHash.get(hash)
      if (existing) return existing
      const created = {
        id: `file-${materializedByHash.size + 1}`,
        type: params.mimeType,
        name: params.name,
        size: params.content.byteLength,
      }
      materializedByHash.set(hash, created)
      return created
    }
  ),
}))

import {
  normalizeMcpToolResult,
  saveFile,
} from '@/backend/lib/tools/file-output-normalization'

describe('tool output normalization', () => {
  beforeEach(() => {
    materializedByHash.clear()
    materializeCalls.length = 0
  })

  test('normalizes MCP image/resource file-like outputs into file content items', async () => {
    const pngData = Buffer.from('fake-png').toString('base64')
    const res = await normalizeMcpToolResult(
      {
        content: [
          { type: 'image', data: pngData, mimeType: 'image/png' },
          {
            type: 'resource',
            resource: { blob: pngData, mimeType: 'image/png', name: 'resource.png' },
          },
        ],
      },
      { assistantId: 'a1', userId: 'u1' }
    )

    expect(res.type).toBe('content')
    if (res.type !== 'content') return
    expect(res.value.every((v) => v.type === 'file')).toBe(true)
    expect(res.value).toHaveLength(2)
  })

  test('openapi-like binary payload persists to stable file descriptor', async () => {
    const persisted = await saveFile({
      assistantId: 'a1',
      userId: 'u1',
      content: Buffer.from('binary-openapi'),
      mimeType: 'application/pdf',
      nameHint: 'report.pdf',
      source: 'OpenAPI',
    })
    expect(persisted.type).toBe('file')
    if (persisted.type === 'file') {
      expect(persisted.name).toBe('report.pdf')
      expect(persisted.mimetype).toBe('application/pdf')
    }
  })

  test('file-like tool outputs in a chat are persisted with CHAT ownership', async () => {
    const persisted = await saveFile({
      assistantId: 'a1',
      userId: 'u1',
      conversationId: 'c1',
      rootOwner: { type: 'CHAT', id: 'c1' },
      content: Buffer.from('chat-owned-output'),
      mimeType: 'image/png',
      source: 'MCP',
    })

    expect(persisted.type).toBe('file')
    expect(materializeCalls).toHaveLength(1)
    expect(materializeCalls[0].owner).toEqual({ ownerType: 'CHAT', ownerId: 'c1' })
  })

  test('dedup regression: repeated identical payload resolves to same file id', async () => {
    const content = Buffer.from('same-bytes')
    const first = await saveFile({
      assistantId: 'a1',
      userId: 'u1',
      content,
      mimeType: 'image/png',
      source: 'MCP',
    })
    const second = await saveFile({
      assistantId: 'a1',
      userId: 'u1',
      content,
      mimeType: 'image/png',
      source: 'MCP',
    })
    expect(first.type).toBe('file')
    expect(second.type).toBe('file')
    if (first.type === 'file' && second.type === 'file') {
      expect(first.id).toBe(second.id)
    }
  })

  test('any mime type is persisted as-is', async () => {
    const persisted = await saveFile({
      assistantId: 'a1',
      userId: 'u1',
      content: Buffer.from('fake'),
      mimeType: 'application/x-msdownload',
      source: 'MCP',
    })
    expect(persisted.type).toBe('file')
    if (persisted.type === 'file') {
      expect(persisted.mimetype).toBe('application/x-msdownload')
    }
  })
})
