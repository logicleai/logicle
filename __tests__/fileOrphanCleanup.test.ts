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

  test('findOrphanFiles queries files with no owner fields', async () => {
    const executeMock = vi.fn().mockResolvedValue([])
    const limitMock = vi.fn(() => ({ execute: executeMock }))
    const where2Mock = vi.fn(() => ({ limit: limitMock }))
    const where1Mock = vi.fn(() => ({ where: where2Mock }))
    const selectMock = vi.fn(() => ({ where: where1Mock }))
    selectFromMock.mockReturnValue({ select: selectMock })

    const { findOrphanFiles } = await import('@/backend/lib/files/orphan-cleanup')
    await findOrphanFiles(25)

    expect(selectFromMock).toHaveBeenCalledWith('File')
    expect(where1Mock).toHaveBeenCalledWith('File.ownerType', 'is', null)
    expect(where2Mock).toHaveBeenCalledWith('File.ownerId', 'is', null)
    expect(limitMock).toHaveBeenCalledWith(25)
    expect(executeMock).toHaveBeenCalled()
  })

  test('dry-run reports candidates without deleting', async () => {
    const fileSelectExecuteMock = vi.fn().mockResolvedValue([])
    const fileLimitMock = vi.fn(() => ({ execute: fileSelectExecuteMock }))
    const fileWhere2Mock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileWhere1Mock = vi.fn(() => ({ where: fileWhere2Mock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhere1Mock }))

    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') return { select: fileSelectMock }
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
    const fileWhere2Mock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileWhere1Mock = vi.fn(() => ({ where: fileWhere2Mock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhere1Mock }))

    const ownerCheckExecuteTakeFirstMock = vi.fn().mockResolvedValue({ ownerType: null, ownerId: null })
    const ownerCheckWhereMock = vi.fn(() => ({ executeTakeFirst: ownerCheckExecuteTakeFirstMock }))
    const ownerCheckSelectMock = vi.fn(() => ({ where: ownerCheckWhereMock }))

    const deleteExecuteTakeFirstMock = vi.fn().mockResolvedValue({ numDeletedRows: 1 })
    const deleteWhereMock = vi.fn(() => ({ executeTakeFirst: deleteExecuteTakeFirstMock }))

    let firstFileSelect = true
    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') {
        if (firstFileSelect) {
          firstFileSelect = false
          return { select: fileSelectMock }
        }
        return { select: ownerCheckSelectMock }
      }
      throw new Error(`unexpected table ${table}`)
    })

    deleteFromMock.mockReturnValue({ where: deleteWhereMock })

    const { runFileOrphanCleanupPass } = await import('@/backend/lib/files/orphan-cleanup')
    const summary = await runFileOrphanCleanupPass('delete')

    expect(summary).toEqual({ mode: 'delete', scanned: 1, deleted: 1, failed: 0 })
    expect(storageRmMock).toHaveBeenCalledWith('p/1')
    expect(deleteFromMock).toHaveBeenCalledWith('File')
    expect(deleteWhereMock).toHaveBeenCalledWith('id', '=', 'file-1')
  })

  test('delete mode never deletes files that gained ownership', async () => {
    const orphanCandidates = [{ id: 'file-2', path: 'p/2', encrypted: 0 as const }]
    const fileSelectExecuteMock = vi.fn().mockResolvedValue(orphanCandidates)
    const fileLimitMock = vi.fn(() => ({ execute: fileSelectExecuteMock }))
    const fileWhere2Mock = vi.fn(() => ({ limit: fileLimitMock }))
    const fileWhere1Mock = vi.fn(() => ({ where: fileWhere2Mock }))
    const fileSelectMock = vi.fn(() => ({ where: fileWhere1Mock }))

    const ownerCheckExecuteTakeFirstMock = vi.fn().mockResolvedValue({ ownerType: 'USER', ownerId: 'u1' })
    const ownerCheckWhereMock = vi.fn(() => ({ executeTakeFirst: ownerCheckExecuteTakeFirstMock }))
    const ownerCheckSelectMock = vi.fn(() => ({ where: ownerCheckWhereMock }))

    let firstFileSelect = true
    selectFromMock.mockImplementation((table: string) => {
      if (table === 'File') {
        if (firstFileSelect) {
          firstFileSelect = false
          return { select: fileSelectMock }
        }
        return { select: ownerCheckSelectMock }
      }
      throw new Error(`unexpected table ${table}`)
    })

    deleteFromMock.mockReturnValue({ where: vi.fn(() => ({ executeTakeFirst: vi.fn() })) })

    const { runFileOrphanCleanupPass } = await import('@/backend/lib/files/orphan-cleanup')
    const summary = await runFileOrphanCleanupPass('delete')

    expect(summary).toEqual({ mode: 'delete', scanned: 1, deleted: 0, failed: 1 })
    expect(storageRmMock).not.toHaveBeenCalled()
  })
})
