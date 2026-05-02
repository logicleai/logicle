import { beforeEach, describe, expect, test, vi } from 'vitest'

const selectFromMock = vi.fn()
const deleteFromMock = vi.fn()
const storageRmMock = vi.fn()
const infoMock = vi.fn()
const warnMock = vi.fn()
const errorMock = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: selectFromMock,
    deleteFrom: deleteFromMock,
  },
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    rm: storageRmMock,
  },
}))

vi.mock('@/lib/logging', () => ({
  logger: {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
  },
}))

vi.mock('@/lib/env', () => ({
  default: {
    fileOrphanCleanup: {
      mode: 'off',
      cadenceMs: 60_000,
      batchSize: 10,
    },
  },
}))

describe('file orphan cleanup', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('findOrphanFiles queries files with no ownership rows', async () => {
    const executeMock = vi.fn().mockResolvedValue([])
    const limitMock = vi.fn(() => ({ execute: executeMock }))
    const whereMock = vi.fn(() => ({ limit: limitMock }))
    const selectMock = vi.fn(() => ({ where: whereMock }))
    const leftJoinMock = vi.fn(() => ({ select: selectMock }))
    selectFromMock.mockReturnValue({ leftJoin: leftJoinMock })

    const { findOrphanFiles } = await import('@/backend/lib/files/orphan-cleanup')
    await findOrphanFiles(25)

    expect(selectFromMock).toHaveBeenCalledWith('File')
    expect(leftJoinMock).toHaveBeenCalledWith('FileOwnership', 'FileOwnership.fileId', 'File.id')
    expect(whereMock).toHaveBeenCalledWith('FileOwnership.id', 'is', null)
    expect(limitMock).toHaveBeenCalledWith(25)
    expect(executeMock).toHaveBeenCalled()
  })

  test('dry-run reports candidates without deleting', async () => {
    const fileSelectExecuteMock = vi.fn().mockResolvedValue([])
    const fileLimitMock = vi.fn(() => ({ execute: fileSelectExecuteMock }))
    const fileWhereMock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhereMock }))
    const fileLeftJoinMock = vi.fn(() => ({ select: fileSelectMock }))
    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') {
        return { leftJoin: fileLeftJoinMock }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { runFileOrphanCleanupPass } = await import('@/backend/lib/files/orphan-cleanup')
    const summary = await runFileOrphanCleanupPass('dry-run', {
      db: { selectFrom: selectFromMock, deleteFrom: vi.fn() } as any,
      storage: { rm: storageRmMock },
      logger: { info: infoMock, warn: warnMock, error: errorMock },
    })

    expect(summary.mode).toBe('dry-run')
    expect(summary.deleted).toBe(0)
    expect(storageRmMock).not.toHaveBeenCalled()
  })

  test('delete mode removes orphan blobs first then file rows', async () => {
    const orphanCandidates = [{ id: 'file-1', path: 'p/1', encrypted: 0 as const }]
    const fileSelectExecuteMock = vi.fn().mockResolvedValue(orphanCandidates)
    const fileLimitMock = vi.fn(() => ({ execute: fileSelectExecuteMock }))
    const fileWhereMock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhereMock }))
    const fileLeftJoinMock = vi.fn(() => ({ select: fileSelectMock }))

    const ownershipExecuteTakeFirstMock = vi.fn().mockResolvedValue(undefined)
    const ownershipWhereMock = vi.fn(() => ({ executeTakeFirst: ownershipExecuteTakeFirstMock }))
    const ownershipSelectMock = vi.fn(() => ({ where: ownershipWhereMock }))

    const deleteExecuteTakeFirstMock = vi.fn().mockResolvedValue({ numDeletedRows: 1 })
    const deleteWhereMock = vi.fn(() => ({ executeTakeFirst: deleteExecuteTakeFirstMock }))

    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') {
        return { leftJoin: fileLeftJoinMock }
      }
      if (table === 'FileOwnership') {
        return { select: ownershipSelectMock }
      }
      throw new Error(`unexpected table ${table}`)
    })

    deleteFromMock.mockReturnValue({ where: deleteWhereMock })

    const { runFileOrphanCleanupPass } = await import('@/backend/lib/files/orphan-cleanup')
    const summary = await runFileOrphanCleanupPass('delete')

    expect(summary).toEqual({
      mode: 'delete',
      scanned: 1,
      deleted: 1,
      failed: 0,
    })
    expect(storageRmMock).toHaveBeenCalledWith('p/1')
    expect(deleteFromMock).toHaveBeenCalledWith('File')
    expect(deleteWhereMock).toHaveBeenCalledWith('id', '=', 'file-1')
  })

  test('delete mode never deletes files that gained ownership', async () => {
    const orphanCandidates = [{ id: 'file-2', path: 'p/2', encrypted: 0 as const }]
    const fileSelectExecuteMock = vi.fn().mockResolvedValue(orphanCandidates)
    const fileLimitMock = vi.fn(() => ({ execute: fileSelectExecuteMock }))
    const fileWhereMock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhereMock }))
    const fileLeftJoinMock = vi.fn(() => ({ select: fileSelectMock }))

    const ownershipExecuteTakeFirstMock = vi.fn().mockResolvedValue({ id: 'own-1' })
    const ownershipWhereMock = vi.fn(() => ({ executeTakeFirst: ownershipExecuteTakeFirstMock }))
    const ownershipSelectMock = vi.fn(() => ({ where: ownershipWhereMock }))

    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') {
        return { leftJoin: fileLeftJoinMock }
      }
      if (table === 'FileOwnership') {
        return { select: ownershipSelectMock }
      }
      throw new Error(`unexpected table ${table}`)
    })

    deleteFromMock.mockReturnValue({
      where: vi.fn(() => ({ executeTakeFirst: vi.fn() })),
    })

    const { runFileOrphanCleanupPass } = await import('@/backend/lib/files/orphan-cleanup')
    const summary = await runFileOrphanCleanupPass('delete')

    expect(summary).toEqual({
      mode: 'delete',
      scanned: 1,
      deleted: 0,
      failed: 1,
    })
    expect(storageRmMock).not.toHaveBeenCalled()
  })
})
