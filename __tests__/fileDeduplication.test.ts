import { beforeEach, describe, expect, test, vi } from 'vitest'

// ── shared mocks ──────────────────────────────────────────────────────────────

const selectFromMock = vi.fn()
const deleteFromMock = vi.fn()
const updateTableMock = vi.fn()
const insertIntoMock = vi.fn()
const transactionMock = vi.fn()
const storageWriteBufferMock = vi.fn()
const storageRmMock = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: selectFromMock,
    deleteFrom: deleteFromMock,
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

vi.mock('@/lib/env', () => ({
  default: {
    fileStorage: { encryptFiles: false },
  },
}))

vi.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

// Builds a selectFrom chain: .select().where().where().where().executeTakeFirst()
function makeSelectChain(result: unknown) {
  const executeTakeFirstMock = vi.fn().mockResolvedValue(result)
  const terminal = { executeTakeFirst: executeTakeFirstMock }
  const w3 = vi.fn(() => terminal)
  const w2 = vi.fn(() => ({ where: w3 }))
  const w1 = vi.fn(() => ({ where: w2 }))
  const selectMock = vi.fn(() => ({ where: w1 }))
  return { chain: { select: selectMock }, executeTakeFirstMock }
}

// ── finalizeUploadedFile ──────────────────────────────────────────────────────

describe('finalizeUploadedFile', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('returns null and marks file uploaded when no duplicate exists', async () => {
    const { chain } = makeSelectChain(undefined)
    selectFromMock.mockReturnValue(chain)

    const updateExecuteMock = vi.fn().mockResolvedValue(undefined)
    const updateWhereMock = vi.fn(() => ({ execute: updateExecuteMock }))
    const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
    updateTableMock.mockReturnValue({ set: updateSetMock })

    const { finalizeUploadedFile } = await import('@/backend/lib/files/upload-dedup')
    const result = await finalizeUploadedFile({
      fileId: 'new-id',
      filePath: 'new-id-file.pdf',
      contentHash: 'abc123',
    })

    expect(result).toBeNull()
    expect(updateTableMock).toHaveBeenCalledWith('File')
    expect(updateSetMock).toHaveBeenCalledWith({ uploaded: 1, contentHash: 'abc123' })
    expect(storageRmMock).not.toHaveBeenCalled()
    expect(deleteFromMock).not.toHaveBeenCalled()
  })

  test('returns canonical ID, removes new blob, and deletes new File row when duplicate exists', async () => {
    const { chain } = makeSelectChain({ id: 'existing-id' })
    selectFromMock.mockReturnValue(chain)

    storageRmMock.mockResolvedValue(undefined)
    const deleteExecuteMock = vi.fn().mockResolvedValue(undefined)
    const deleteWhereMock = vi.fn(() => ({ execute: deleteExecuteMock }))
    deleteFromMock.mockReturnValue({ where: deleteWhereMock })

    const { finalizeUploadedFile } = await import('@/backend/lib/files/upload-dedup')
    const result = await finalizeUploadedFile({
      fileId: 'new-id',
      filePath: 'new-id-file.pdf',
      contentHash: 'abc123',
    })

    expect(result).toBe('existing-id')
    expect(storageRmMock).toHaveBeenCalledWith('new-id-file.pdf')
    expect(deleteFromMock).toHaveBeenCalledWith('File')
    expect(deleteWhereMock).toHaveBeenCalledWith('id', '=', 'new-id')
    expect(updateTableMock).not.toHaveBeenCalled()
  })

  test('does not delete File row if storage.rm throws', async () => {
    const { chain } = makeSelectChain({ id: 'existing-id' })
    selectFromMock.mockReturnValue(chain)

    storageRmMock.mockRejectedValue(new Error('storage failure'))

    const { finalizeUploadedFile } = await import('@/backend/lib/files/upload-dedup')
    await expect(
      finalizeUploadedFile({ fileId: 'new-id', filePath: 'new-id-file.pdf', contentHash: 'abc123' })
    ).rejects.toThrow('storage failure')

    expect(deleteFromMock).not.toHaveBeenCalled()
  })
})

// ── materializeFile deduplication ─────────────────────────────────────────────

describe('materializeFile deduplication', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  const existingFile = {
    id: 'existing-id',
    name: 'photo.png',
    path: 'existing-id-photo-png',
    type: 'image/png',
    size: 1024,
    uploaded: 1 as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    encrypted: 0 as const,
    contentHash: 'deadbeef',
  }

  // materializeFile hash lookup: .selectAll().where().where().executeTakeFirst()
  function makeHashLookupChain(result: unknown) {
    const executeTakeFirstMock = vi.fn().mockResolvedValue(result)
    const w2 = vi.fn(() => ({ executeTakeFirst: executeTakeFirstMock }))
    const w1 = vi.fn(() => ({ where: w2 }))
    const selectAllMock = vi.fn(() => ({ where: w1 }))
    return { chain: { selectAll: selectAllMock } }
  }

  // getFileWithId lookup: .selectAll().where().executeTakeFirst()
  function makeGetByIdChain(result: unknown) {
    const executeTakeFirstMock = vi.fn().mockResolvedValue(result)
    const whereMock = vi.fn(() => ({ executeTakeFirst: executeTakeFirstMock }))
    const selectAllMock = vi.fn(() => ({ where: whereMock }))
    return { chain: { selectAll: selectAllMock } }
  }

  test('reuses existing File row when content hash matches', async () => {
    const { chain } = makeHashLookupChain(existingFile)
    selectFromMock.mockReturnValue(chain)

    const insertExecuteMock = vi.fn().mockResolvedValue(undefined)
    insertIntoMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflict: vi.fn(() => ({ execute: insertExecuteMock })),
      })),
    })

    const { materializeFile } = await import('@/backend/lib/files/materialize')
    const result = await materializeFile({
      content: Buffer.from('hello'),
      name: 'photo.png',
      mimeType: 'image/png',
      owner: { ownerType: 'CHAT', ownerId: 'chat-1' },
    })

    expect(result.id).toBe('existing-id')
    expect(storageWriteBufferMock).not.toHaveBeenCalled()
    expect(insertIntoMock).toHaveBeenCalledWith('FileOwnership')
  })

  test('writes blob and inserts new File and FileOwnership rows when no hash match', async () => {
    const newFile = { ...existingFile, id: 'test-id', contentHash: 'newhash' }

    // First call: hash lookup → no match; second call: getFileWithId → new file
    const { chain: hashChain } = makeHashLookupChain(undefined)
    const { chain: getByIdChain } = makeGetByIdChain(newFile)
    selectFromMock.mockReturnValueOnce(hashChain).mockReturnValueOnce(getByIdChain)

    storageWriteBufferMock.mockResolvedValue(undefined)

    const insertFileExecuteMock = vi.fn().mockResolvedValue(undefined)
    const insertOwnershipExecuteMock = vi.fn().mockResolvedValue(undefined)
    transactionMock.mockImplementation(async (fn: (trx: any) => Promise<void>) => {
      const trx = {
        insertInto: vi.fn((table: string) => {
          if (table === 'FileOwnership') {
            return { values: vi.fn(() => ({ execute: insertOwnershipExecuteMock })) }
          }
          return { values: vi.fn(() => ({ execute: insertFileExecuteMock })) }
        }),
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
    expect(insertFileExecuteMock).toHaveBeenCalledOnce()
    expect(insertOwnershipExecuteMock).toHaveBeenCalledOnce()
  })
})
