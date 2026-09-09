import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import type * as dto from '@/types/dto'
import type { CorpusDocument } from './types'

/**
 * Materializes a scenario's corpus as real `File` rows with real bytes in storage.
 *
 * The harness runs against a throwaway database rather than mocks, so every arm goes through the
 * same code paths a deployment does — text extraction, analysis, ownership. An arm that "wins" by
 * skipping that machinery would not be measuring anything.
 */

export interface MaterializedCorpus {
  files: dto.AssistantFile[]
  cleanup: () => Promise<void>
}

const OWNER_ID = 'eval-user'

export const materializeCorpus = async (
  documents: CorpusDocument[],
  runId: string
): Promise<MaterializedCorpus> => {
  const files: dto.AssistantFile[] = []
  const paths: string[] = []
  const fileIds: string[] = []
  const blobIds: string[] = []
  const now = new Date().toISOString()

  for (const document of documents) {
    const bytes = Buffer.from(document.text, 'utf-8')
    const path = `eval-${runId}-${nanoid(8)}`
    await storage.writeBuffer(path, bytes, null)
    paths.push(path)

    const blobId = nanoid()
    await db
      .insertInto('FileBlob')
      .values({
        id: blobId,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        path,
        type: document.mimeType,
        size: bytes.length,
        encryption: null,
        createdAt: now,
      })
      .execute()
    blobIds.push(blobId)

    const fileId = nanoid()
    // `File` still carries the pre-blob `size`/`uploaded`/`encrypted` columns as NOT NULL, so they
    // have to be written even though `FileBlob` is now the source of truth. `addFile` in
    // models/file.ts does the same, and casts for the same reason.
    await db
      .insertInto('File')
      .values({
        id: fileId,
        name: document.name,
        origin: 'uploaded',
        ownerType: 'USER',
        ownerId: OWNER_ID,
        path,
        type: document.mimeType,
        createdAt: now,
        fileBlobId: blobId,
        size: bytes.length,
        uploaded: 1,
        encrypted: 0,
      } as never)
      .execute()
    fileIds.push(fileId)

    files.push({ id: fileId, name: document.name, type: document.mimeType, size: bytes.length })
  }

  return {
    files,
    cleanup: async () => {
      if (fileIds.length > 0) {
        await db.deleteFrom('File').where('id', 'in', fileIds).execute()
        await db.deleteFrom('FileAnalysis').where('fileId', 'in', fileIds).execute()
      }
      if (blobIds.length > 0) {
        await db.deleteFrom('FileBlob').where('id', 'in', blobIds).execute()
      }
      for (const path of paths) {
        await storage.rm(path).catch(() => undefined)
      }
    },
  }
}
