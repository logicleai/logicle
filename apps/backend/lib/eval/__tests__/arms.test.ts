import { describe, expect, it, vi } from 'vitest'
import { ingestKnowledgeBoxFiles } from '@/backend/lib/eval/arms'
import type { IngestResult } from '@/backend/lib/knowledge/store'

const files = [
  { id: 'file-good', name: 'good.pdf', type: 'application/pdf', size: 10 },
  { id: 'file-bad', name: 'legacy.doc', type: 'application/msword', size: 20 },
  { id: 'file-good-2', name: 'good-2.pdf', type: 'application/pdf', size: 30 },
]

const result: IngestResult = {
  contentHash: 'hash',
  chunks: [],
  projections: [],
  projectionUsage: {
    inputTokens: 11,
    outputTokens: 7,
    calls: 1,
    modelId: 'test-model',
    providerUsages: [{ inputTokens: 11, outputTokens: 7 }],
  },
}

describe('ingestKnowledgeBoxFiles', () => {
  it('keeps ingesting after one document cannot be extracted', async () => {
    const ingestDocument = vi.fn(async (_boxId: string, fileId: string) => {
      if (fileId === 'file-bad') throw new Error('No text could be extracted from "legacy.doc"')
      return result
    })
    const saveIngestResult = vi.fn(async () => undefined)
    const markDocumentFailed = vi.fn(async () => undefined)

    const setupCost = await ingestKnowledgeBoxFiles('box-1', files, {
      ingestDocument,
      saveIngestResult,
      markDocumentFailed,
    })

    expect(ingestDocument).toHaveBeenCalledTimes(3)
    expect(saveIngestResult).toHaveBeenCalledTimes(2)
    expect(markDocumentFailed).toHaveBeenCalledWith(
      'box-1',
      'file-bad',
      'No text could be extracted from "legacy.doc"'
    )
    expect(setupCost).toMatchObject({
      inputTokens: 22,
      outputTokens: 14,
      calls: 2,
      modelId: 'test-model',
    })
  })
})
