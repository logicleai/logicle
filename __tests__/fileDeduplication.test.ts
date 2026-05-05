import { beforeEach, describe, expect, test, vi } from 'vitest'

const selectFromMock = vi.fn()
const updateTableMock = vi.fn()
const insertIntoMock = vi.fn()
const transactionMock = vi.fn()
const storageWriteBufferMock = vi.fn()
const storageRmMock = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: selectFromMock,
    updateTable: updateTableMock,
    insertInto: insertIntoMock,
    transaction: () => ({ execute: transactionMock }),
  },
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    writeBuffer: storageWriteBufferMock,
    rm: storageRmMock,
  },
}))

const mockEnvConfig = { fileStorage: { encryptFiles: false } }
vi.mock('@/lib/env', () => ({ default: mockEnvConfig }))
vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

const makeSelectFirstBuilder = (result: unknown) => {
  const exec = vi.fn().mockResolvedValue(result)
  const where = vi.fn(() => ({ executeTakeFirst: exec }))
  return { where }
}

const makeSelectFirstOrThrowBuilder = (result: unknown) => {
  const exec = vi.fn().mockResolvedValue(result)
  const where = vi.fn(() => ({ executeTakeFirstOrThrow: exec }))
  return { where }
}

describe('finalizeUploadedFile', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('creates a FileBlob and links File when hash is new', async () => {
    const blobRow = {
      id: 'test-id',
      contentHash: 'abc123',
      path: 'new-id-file.pdf',
      type: 'application/pdf',
      size: 10,
      encrypted: 0 as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    selectFromMock.mockReturnValueOnce({ selectAll: vi.fn(() => makeSelectFirstOrThrowBuilder(blobRow)) })

    const insertExecuteMock = vi.fn().mockResolvedValue(undefined)
    insertIntoMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflict: vi.fn(() => ({ execute: insertExecuteMock })),
      })),
    })

    const updateExecuteMock = vi.fn().mockResolvedValue(undefined)
    const updateWhere1 = vi.fn(() => ({ execute: updateExecuteMock }))
    updateTableMock.mockReturnValueOnce({ set: vi.fn(() => ({ where: updateWhere1 })) })

    const { finalizeUploadedFile } = await import('@/backend/lib/files/upload-dedup')
    const result = await finalizeUploadedFile({
      fileId: 'new-id',
      filePath: 'new-id-file.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
      fileEncrypted: 0,
      contentHash: 'abc123',
    })

    expect(result).toBeUndefined()
    expect(insertIntoMock).toHaveBeenCalledWith('FileBlob')
    expect(storageRmMock).not.toHaveBeenCalled()
    expect(updateTableMock).toHaveBeenCalledWith('File')
  })

  test('removes uploaded path when blob already exists and links File to canonical blob', async () => {
    const blobRow = {
      id: 'canonical-blob',
      contentHash: 'abc123',
      path: 'canonical.txt',
      type: 'text/plain',
      size: 4,
      encrypted: 0 as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    selectFromMock.mockReturnValueOnce({ selectAll: vi.fn(() => makeSelectFirstOrThrowBuilder(blobRow)) })

    insertIntoMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflict: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
      })),
    })

    const updateExecuteMock = vi.fn().mockResolvedValue(undefined)
    const updateWhere1 = vi.fn(() => ({ execute: updateExecuteMock }))
    updateTableMock.mockReturnValueOnce({ set: vi.fn(() => ({ where: updateWhere1 })) })

    const { finalizeUploadedFile } = await import('@/backend/lib/files/upload-dedup')
    const result = await finalizeUploadedFile({
      fileId: 'new-id',
      filePath: 'new-id-file.pdf',
      fileType: 'text/plain',
      fileSize: 4,
      fileEncrypted: 0,
      contentHash: 'abc123',
    })

    expect(result).toBeUndefined()
    expect(storageRmMock).toHaveBeenCalledWith('new-id-file.pdf')
  })
})

describe('materializeFile deduplication', () => {
  beforeEach(() => {
    mockEnvConfig.fileStorage.encryptFiles = false
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('creates FileBlob and new logical File when blob does not exist', async () => {
    const createdFile = {
      id: 'test-id',
      name: 'doc.pdf',
      path: 'test-id-doc-pdf',
      type: 'application/pdf',
      size: 11,
      createdAt: '2026-01-01T00:00:00.000Z',
      encrypted: 0 as const,
      fileBlobId: 'test-id',
    }

    selectFromMock
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder(undefined)) })
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder({
        id: 'test-id', contentHash: 'newhash', path: 'test-id-doc-pdf', type: 'application/pdf', size: 11, encrypted: 0, createdAt: '2026-01-01T00:00:00.000Z'
      })) })
      .mockReturnValueOnce({ selectAll: vi.fn(() => ({ where: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(createdFile) })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder({ size: 11, encrypted: 0 })) })

    storageWriteBufferMock.mockResolvedValue(undefined)

    const insertBlobExec = vi.fn().mockResolvedValue(undefined)
    insertIntoMock.mockReturnValue({
      values: vi.fn(() => ({ onConflict: vi.fn(() => ({ execute: insertBlobExec })) })),
    })

    const insertFileExecuteMock = vi.fn().mockResolvedValue(undefined)
    transactionMock.mockImplementation(async (fn: (trx: any) => Promise<void>) => {
      const trx = {
        insertInto: vi.fn(() => ({ values: vi.fn(() => ({ execute: insertFileExecuteMock })) })),
      }
      await fn(trx)
    })

    const { materializeFile } = await import('@/backend/lib/files/materialize')
    const result = await materializeFile({
      content: Buffer.from('new content'),
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      owner: { ownerType: 'CHAT', ownerId: 'chat-2' },
    })

    expect(result.id).toBe('test-id')
    expect(storageWriteBufferMock).toHaveBeenCalledOnce()
    expect(insertIntoMock).toHaveBeenCalledWith('FileBlob')
    expect(insertFileExecuteMock).toHaveBeenCalledOnce()
  })

  test('reuses existing blob and skips storage write', async () => {
    const blob = {
      id: 'blob-1',
      contentHash: 'deadbeef',
      path: 'blob-1-photo-png',
      type: 'image/png',
      size: 5,
      encrypted: 0 as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    const createdFile = {
      id: 'test-id',
      name: 'photo.png',
      path: blob.path,
      type: blob.type,
      size: blob.size,
      createdAt: '2026-01-01T00:00:00.000Z',
      encrypted: 0 as const,
      fileBlobId: blob.id,
    }

    selectFromMock
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder(blob)) })
      .mockReturnValueOnce({ selectAll: vi.fn(() => ({ where: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(createdFile) })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder({ size: 5, encrypted: 0 })) })

    transactionMock.mockImplementation(async (fn: (trx: any) => Promise<void>) => {
      const trx = {
        insertInto: vi.fn(() => ({ values: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })) })),
      }
      await fn(trx)
    })

    const { materializeFile } = await import('@/backend/lib/files/materialize')
    const result = await materializeFile({
      content: Buffer.from('hello'),
      name: 'photo.png',
      mimeType: 'image/png',
      owner: { ownerType: 'CHAT', ownerId: 'chat-1' },
    })

    expect(result.fileBlobId).toBe('blob-1')
    expect(storageWriteBufferMock).not.toHaveBeenCalled()
  })

  test('removes raced storage write when another materialization created the blob first', async () => {
    const blob = {
      id: 'canonical-blob',
      contentHash: 'racehash',
      path: 'canonical-photo-png',
      type: 'image/png',
      size: 5,
      encrypted: 0 as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const createdFile = {
      id: 'test-id',
      name: 'photo.png',
      path: blob.path,
      type: blob.type,
      size: blob.size,
      createdAt: '2026-01-01T00:00:00.000Z',
      encrypted: 0 as const,
      fileBlobId: blob.id,
    }

    selectFromMock
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder(undefined)) })
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder(blob)) })
      .mockReturnValueOnce({ selectAll: vi.fn(() => ({ where: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(createdFile) })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => makeSelectFirstBuilder({ size: 5, encrypted: 0 })) })

    storageWriteBufferMock.mockResolvedValue(undefined)
    storageRmMock.mockResolvedValue(undefined)
    insertIntoMock.mockReturnValue({
      values: vi.fn(() => ({ onConflict: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })) })),
    })
    transactionMock.mockImplementation(async (fn: (trx: any) => Promise<void>) => {
      const trx = {
        insertInto: vi.fn(() => ({ values: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })) })),
      }
      await fn(trx)
    })

    const { materializeFile } = await import('@/backend/lib/files/materialize')
    const result = await materializeFile({
      content: Buffer.from('hello'),
      name: 'photo.png',
      mimeType: 'image/png',
      owner: { ownerType: 'CHAT', ownerId: 'chat-1' },
    })

    expect(result.fileBlobId).toBe('canonical-blob')
    expect(storageWriteBufferMock).toHaveBeenCalledOnce()
    expect(storageRmMock).toHaveBeenCalledWith('test-id-photo-png')
  })
})
