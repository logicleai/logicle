// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useDuplicateAssistant } from '@/hooks/useDuplicateAssistant'
import { AssistantDropdown } from '@/app/chat/components/AssistantDropdown'
import type * as dto from '@/types/dto'

const mocks = vi.hoisted(() => ({
  pathname: '/chat/assistants/mine',
  post: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/lib/fetch', () => ({ post: mocks.post }))
vi.mock('swr', () => ({ mutate: mocks.mutate }))
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toast } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/providers/userProfileContext', () => ({
  useUserProfile: () => ({ id: 'user', workspaces: [] }),
}))
vi.mock('@/app/context/environmentProvider', () => ({
  useEnvironment: () => ({ enableAssistantDuplicate: true }),
}))
vi.mock('@/components/providers/layoutconfigContext', () => ({
  useLayoutConfig: () => ({ isMobile: false }),
}))
vi.mock('@/components/app/AssistantDetailsDialog', () => ({ AssistantDetailsDialog: () => null }))
vi.mock('@/components/app/Avatars', () => ({
  AssistantAvatar: () => <span data-testid="assistant-avatar" />,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let duplicate: ReturnType<typeof useDuplicateAssistant>['duplicateAssistant']
function DuplicateButton() {
  const { duplicateAssistant, duplicatingAssistantId } = useDuplicateAssistant()
  duplicate = duplicateAssistant
  return (
    <button
      type="button"
      disabled={duplicatingAssistantId !== null}
      onClick={() => void duplicateAssistant('source')}
    >
      {duplicatingAssistantId ? 'Loading' : 'Duplicate'}
    </button>
  )
}

let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  mocks.pathname = '/chat/assistants/mine'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<DuplicateButton />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

test('blocks rapid activations through the response, cache refresh, and navigation', async () => {
  const response = deferred<{ data: { id: string } }>()
  const cache = deferred<void>()
  mocks.post.mockReturnValue(response.promise)
  mocks.mutate.mockReturnValue(cache.promise)
  let operation!: Promise<void>
  await act(async () => {
    operation = duplicate('source')
    await duplicate('source')
  })
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(container.querySelector('button')?.disabled).toBe(true)
  expect(container.textContent).toBe('Loading')
  await act(async () => response.resolve({ data: { id: 'copy' } }))
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  await act(async () => {
    cache.resolve()
    await operation
  })
  expect(mocks.push).toHaveBeenCalledWith('/assistants/copy')
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(container.querySelector('button')?.disabled).toBe(true)
  mocks.pathname = '/assistants/copy'
  await act(async () => root.render(<DuplicateButton />))
  expect(container.querySelector('button')?.disabled).toBe(false)
})

test.each(['api', 'network'])('allows retry after a %s failure', async (kind) => {
  if (kind === 'api') mocks.post.mockResolvedValueOnce({ error: { message: 'Failed' } })
  else mocks.post.mockRejectedValueOnce(new Error('Failed'))
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.toast).toHaveBeenCalledWith('Failed')
  expect(container.querySelector('button')?.disabled).toBe(false)
  mocks.post.mockResolvedValueOnce({ data: { id: 'retry-copy' } })
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.post).toHaveBeenCalledTimes(2)
  expect(mocks.push).toHaveBeenCalledWith('/assistants/retry-copy')
})

test('keeps a pending request guarded when the user navigates elsewhere', async () => {
  const response = deferred<{ data: { id: string } }>()
  mocks.post.mockReturnValue(response.promise)
  let operation!: Promise<void>
  await act(async () => {
    operation = duplicate('source')
  })
  mocks.pathname = '/chat'
  await act(async () => root.render(<DuplicateButton />))
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(container.querySelector('button')?.disabled).toBe(true)
  await act(async () => {
    response.resolve({ data: { id: 'copy' } })
    await operation
  })
})

test('navigates to the created copy even when cache refresh fails', async () => {
  mocks.post.mockResolvedValue({ data: { id: 'copy' } })
  mocks.mutate.mockRejectedValue(new Error('Cache refresh failed'))
  await act(async () => {
    await duplicate('source')
  })
  expect(mocks.push).toHaveBeenCalledWith('/assistants/copy')
  expect(container.querySelector('button')?.disabled).toBe(true)
  expect(mocks.toast).not.toHaveBeenCalled()
})

const assistant = {
  id: 'source',
  name: 'Source assistant',
  owner: 'user',
  sharing: [],
} as unknown as dto.UserAssistant

async function startFromChatMenu() {
  await act(async () => root.render(<AssistantDropdown assistant={assistant} />))
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const duplicateItem = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find((item) => item.textContent === 'duplicate')!
  expect(duplicateItem).toBeDefined()
  await act(async () => duplicateItem.click())
}

test('chat keeps progress visible after the menu closes, through cache refresh and navigation', async () => {
  const response = deferred<{ data: { id: string } }>()
  const cache = deferred<void>()
  mocks.post.mockReturnValue(response.promise)
  mocks.mutate.mockReturnValue(cache.promise)
  await startFromChatMenu()
  expect(mocks.post).toHaveBeenCalledWith('/api/assistants/source/clone')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('duplicating')
  expect(container.querySelector('[data-testid="assistant-avatar"]')).not.toBeNull()
  expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await act(async () => response.resolve({ data: { id: 'copy' } }))
  expect(mocks.push).not.toHaveBeenCalled()
  expect(container.querySelector('[role="status"]')).not.toBeNull()
  await act(async () => cache.resolve())
  expect(mocks.push).toHaveBeenCalledWith('/assistants/copy')
  expect(container.querySelector('[role="status"]')).not.toBeNull()
})

test('chat restores the assistant dropdown closed and ready to retry when duplication fails', async () => {
  const response = deferred<{ error: { message: string } }>()
  mocks.post.mockReturnValue(response.promise)
  await startFromChatMenu()
  await act(async () => response.resolve({ error: { message: 'Failed' } }))
  expect(mocks.toast).toHaveBeenCalledWith('Failed')
  expect(container.querySelector('[role="status"]')).toBeNull()
  expect(container.querySelector('button[aria-haspopup="menu"]')?.textContent).toContain(
    'Source assistant'
  )
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await startFromChatMenu()
  expect(mocks.post).toHaveBeenCalledTimes(2)
})
