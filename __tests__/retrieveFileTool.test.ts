import { beforeEach, describe, expect, test, vi } from 'vitest'

const executeTakeFirst = vi.fn()
const extractFromFile = vi.fn()
const readBuffer = vi.fn()

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

describe('file-manager read_file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const result = await readFile.invoke({ params: { id: 'file-1' } } as any)

    expect(result).toEqual({ type: 'text', value: 'hello world' })
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
    const result = await readFile.invoke({ params: { id: 'file-2' } } as any)

    expect(result).toEqual({ type: 'text', value: Buffer.from([1, 2, 3]).toString('base64') })
    expect(readBuffer).toHaveBeenCalledWith(fileEntry.path, true)
  })
})
