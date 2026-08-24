import { beforeEach, describe, expect, test, vi } from 'vitest'

const getFileWithIdMock = vi.fn()
const canAccessFileMock = vi.fn()
const readBufferMock = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId: getFileWithIdMock,
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: canAccessFileMock,
}))
vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: readBufferMock },
}))

// Minimal valid 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('DOCX export authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('does not resolve or read content for a file the principal cannot access', async () => {
    canAccessFileMock.mockResolvedValue(false)
    const { renderDocxFromMarkdown } = await import('../apps/backend/lib/docx/export')

    await renderDocxFromMarkdown('![img](/api/files/secret-file/content)', { userId: 'attacker' })

    expect(canAccessFileMock).toHaveBeenCalledWith({ userId: 'attacker' }, 'secret-file')
    expect(getFileWithIdMock).not.toHaveBeenCalled()
    expect(readBufferMock).not.toHaveBeenCalled()
  })

  test('does not turn an inaccessible non-image file into a link', async () => {
    canAccessFileMock.mockResolvedValue(false)
    const { renderDocxFromMarkdown } = await import('../apps/backend/lib/docx/export')

    await renderDocxFromMarkdown('![doc](/api/files/secret-doc/content)', { userId: 'attacker' })

    expect(getFileWithIdMock).not.toHaveBeenCalled()
  })

  test('reads content for a file the principal can access', async () => {
    canAccessFileMock.mockResolvedValue(true)
    getFileWithIdMock.mockResolvedValue({
      id: 'ok-file',
      path: 'some/path.png',
      encryption: null,
      type: 'image/png',
      name: 'a.png',
    })
    readBufferMock.mockResolvedValue(Buffer.from(PNG_BASE64, 'base64'))
    const { renderDocxFromMarkdown } = await import('../apps/backend/lib/docx/export')

    await renderDocxFromMarkdown('![img](/api/files/ok-file/content)', { userId: 'owner' })

    expect(canAccessFileMock).toHaveBeenCalledWith({ userId: 'owner' }, 'ok-file')
    expect(readBufferMock).toHaveBeenCalledWith('some/path.png', null)
  })
})
