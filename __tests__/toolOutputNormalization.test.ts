import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'

const materializedByHash = new Map<string, { id: string; type: string; name: string; size: number }>()

vi.mock('@/backend/lib/files/materialize', () => ({
  materializeFile: vi.fn(async (params: { content: Buffer; name: string; mimeType: string }) => {
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
  }),
}))

import {
  normalizeMcpToolResult,
  persistFileLikePayload,
} from '@/backend/lib/tools/file-output-normalization'

describe('tool output normalization', () => {
  beforeEach(() => {
    materializedByHash.clear()
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
      { assistantId: 'a1' }
    )

    expect(res.type).toBe('content')
    if (res.type !== 'content') return
    expect(res.value.every((v) => v.type === 'file')).toBe(true)
    expect(res.value).toHaveLength(2)
  })

  test('openapi-like binary payload persists to stable file descriptor', async () => {
    const payload = Buffer.from('binary-openapi').toString('base64')
    const persisted = await persistFileLikePayload({
      assistantId: 'a1',
      base64Data: payload,
      mimeType: 'application/pdf',
      nameHint: 'report.pdf',
      source: 'OpenAPI',
    })
    expect(persisted.kind).toBe('file')
    expect(persisted.value.type).toBe('file')
    if (persisted.value.type === 'file') {
      expect(persisted.value.name).toBe('report.pdf')
      expect(persisted.value.mimetype).toBe('application/pdf')
    }
  })

  test('dedup regression: repeated identical payload resolves to same file id', async () => {
    const payload = Buffer.from('same-bytes').toString('base64')
    const first = await persistFileLikePayload({
      assistantId: 'a1',
      base64Data: payload,
      mimeType: 'image/png',
      source: 'MCP',
    })
    const second = await persistFileLikePayload({
      assistantId: 'a1',
      base64Data: payload,
      mimeType: 'image/png',
      source: 'MCP',
    })
    expect(first.value.type).toBe('file')
    expect(second.value.type).toBe('file')
    if (first.value.type === 'file' && second.value.type === 'file') {
      expect(first.value.id).toBe(second.value.id)
    }
  })

  test('unsupported mime types degrade to text fallback', async () => {
    const payload = Buffer.from('fake').toString('base64')
    const persisted = await persistFileLikePayload({
      assistantId: 'a1',
      base64Data: payload,
      mimeType: 'application/x-msdownload',
      source: 'MCP',
      supportedMedia: ['image/png'],
    })
    expect(persisted.kind).toBe('text')
    expect(persisted.value.type).toBe('text')
  })
})
