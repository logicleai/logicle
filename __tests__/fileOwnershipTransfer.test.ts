import { beforeEach, describe, expect, test, vi } from 'vitest'

const updateExecute = vi.fn()
const whereOwnerId = vi.fn(() => ({ execute: updateExecute }))
const whereOwnerType = vi.fn(() => ({ where: whereOwnerId }))
const whereIds = vi.fn(() => ({ where: whereOwnerType }))
const setMock = vi.fn(() => ({ where: whereIds }))
const updateTableMock = vi.fn(() => ({ set: setMock }))

vi.mock('db/database', () => ({
  db: {
    updateTable: updateTableMock,
  },
}))

describe('reassignUserOwnedFilesToConversation', () => {
  beforeEach(() => {
    updateExecute.mockReset()
    whereOwnerId.mockClear()
    whereOwnerType.mockClear()
    whereIds.mockClear()
    setMock.mockClear()
    updateTableMock.mockClear()
  })

  test('does nothing when no file ids are provided', async () => {
    const { reassignUserOwnedFilesToConversation } = await import('@/models/file')

    await reassignUserOwnedFilesToConversation({
      fileIds: [],
      userId: 'u1',
      conversationId: 'c1',
    })

    expect(updateTableMock).not.toHaveBeenCalled()
  })

  test('reassigns only current user USER-owned files to CHAT owner', async () => {
    const { reassignUserOwnedFilesToConversation } = await import('@/models/file')

    await reassignUserOwnedFilesToConversation({
      fileIds: ['f1', 'f1', 'f2'],
      userId: 'u1',
      conversationId: 'c1',
    })

    expect(updateTableMock).toHaveBeenCalledWith('File')
    expect(setMock).toHaveBeenCalledWith({
      ownerType: 'CHAT',
      ownerId: 'c1',
    })
    expect(whereIds).toHaveBeenCalledWith('id', 'in', ['f1', 'f2'])
    expect(whereOwnerType).toHaveBeenCalledWith('ownerType', '=', 'USER')
    expect(whereOwnerId).toHaveBeenCalledWith('ownerId', '=', 'u1')
    expect(updateExecute).toHaveBeenCalledOnce()
  })
})
