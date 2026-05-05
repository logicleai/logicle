import { beforeEach, describe, expect, test, vi } from 'vitest'

const executeTakeFirst = vi.fn()
const extractFromFile = vi.fn()
const readBuffer = vi.fn()
const canAccessFile = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn(() => ({
        where: vi.fn(() => ({
          executeTakeFirst,
        })),
      })),
    })),
  },
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: {
    extractFromFile,
  },
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer,
  },
}))

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile,
}))

describe('file-manager read_file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canAccessFile.mockResolvedValue(true)
  })

  test('returns extracted text when available', async () => {
    const fileEntry = {
      id: 'file-1',
      name: 'note.txt',
      type: 'text/plain',
      path: 'files/note.txt',
      encrypted: 0,
      size: 10,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)
    extractFromFile.mockResolvedValue('hello world')

    const { FileManagerPlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new FileManagerPlugin({ id: 't1', name: 'fm', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file as any
    const result = await readFile.invoke({ params: { id: 'file-1' }, userId: 'u1' } as any)

    expect(result).toEqual({ type: 'text', value: 'hello world' })
    expect(canAccessFile).toHaveBeenCalledWith('u1', 'file-1')
    expect(readBuffer).not.toHaveBeenCalled()
  })

  test('falls back to base64 bytes when text extraction is unavailable', async () => {
    const fileEntry = {
      id: 'file-2',
      name: 'bin.dat',
      type: 'application/octet-stream',
      path: 'files/bin.dat',
      encrypted: 1,
      size: 3,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)
    extractFromFile.mockResolvedValue('')
    readBuffer.mockResolvedValue(Buffer.from([1, 2, 3]))

    const { FileManagerPlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new FileManagerPlugin({ id: 't1', name: 'fm', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file as any
    const result = await readFile.invoke({ params: { id: 'file-2' }, userId: 'u1' } as any)

    expect(result).toEqual({ type: 'text', value: Buffer.from([1, 2, 3]).toString('base64') })
    expect(readBuffer).toHaveBeenCalledWith(fileEntry.path, true)
  })

  test('denies read_file when the caller cannot access the file', async () => {
    const fileEntry = {
      id: 'file-private',
      name: 'private.txt',
      type: 'text/plain',
      path: 'files/private.txt',
      encrypted: 0,
      size: 10,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)
    canAccessFile.mockResolvedValue(false)

    const { FileManagerPlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new FileManagerPlugin({ id: 't1', name: 'fm', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file as any
    const result = await readFile.invoke({ params: { id: 'file-private' }, userId: 'u2' } as any)

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
    expect(extractFromFile).not.toHaveBeenCalled()
    expect(readBuffer).not.toHaveBeenCalled()
  })
})
