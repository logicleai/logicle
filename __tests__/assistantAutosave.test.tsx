// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AssistantPage from '@/app/assistants/[id]/PageClient'
import type * as dto from '@/types/dto'

const mocks = vi.hoisted(() => ({
  pathname: '/assistants/A',
  get: vi.fn(),
  patch: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/lib/fetch', () => ({
  get: mocks.get,
  patchWithSignal: mocks.patch,
  patch: vi.fn(),
  post: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toast, success: vi.fn() } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/providers/userProfileContext', () => ({
  useUserProfile: () => ({ id: 'user', workspaces: [] }),
}))
vi.mock('@/components/ui', () => ({
  WithLoadingAndError: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/app/assistants/components/AssistantPreview', () => ({ AssistantPreview: () => null }))
vi.mock('@/app/assistants/components/AssistantSharingDialog', () => ({
  AssistantSharingDialog: () => null,
}))
vi.mock('react-loader-spinner', () => ({ RotatingLines: () => null }))
// Exercise the real page lifecycle and save handler, replacing only the complex form UI.
vi.mock('@/app/assistants/components/AssistantForm', () => ({
  AssistantForm: ({
    assistant,
    onChange,
  }: {
    assistant: dto.AssistantDraft
    onChange: (value: dto.UpdateableAssistantDraft) => void
  }) => (
    <button
      type="button"
      data-testid="edit"
      onClick={() => onChange({ description: 'Edited', files: assistant.files })}
    >
      Edit {assistant.assistantId}
    </button>
  ),
}))

function draft(id: string) {
  return {
    id,
    assistantId: id,
    name: id,
    description: '',
    files: [{ id: `file-${id}` }],
    prompts: [],
    tags: [],
    tools: [],
    subAssistants: [],
    satellites: [],
    sharing: [],
    owner: 'user',
    pendingChanges: false,
  } as unknown as dto.AssistantDraft
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let root: Root
let container: HTMLDivElement
async function navigate(id: string) {
  mocks.pathname = `/assistants/${id}`
  await act(async () => root.render(<AssistantPage />))
}
async function edit() {
  await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="edit"]')!.click())
}
async function autosave() {
  await act(async () => vi.advanceTimersByTimeAsync(5000))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.resetAllMocks()
  mocks.get.mockImplementation(async (url: string) => ({ data: draft(url.split('/').at(-1)!) }))
  mocks.patch.mockResolvedValue({ data: undefined })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})

test('autosaves B to B after A and B open in the same page component', async () => {
  await navigate('A')
  await navigate('B')
  await edit()
  await autosave()
  expect(mocks.patch).toHaveBeenCalledTimes(1)
  expect(mocks.patch).toHaveBeenCalledWith(
    '/api/assistants/B',
    expect.objectContaining({ description: 'Edited', files: [{ id: 'file-B' }] }),
    expect.any(AbortSignal)
  )
})

test('cancels a scheduled autosave when switching assistants', async () => {
  await navigate('A')
  await edit()
  await navigate('B')
  await autosave()
  expect(mocks.patch).not.toHaveBeenCalled()
  await edit()
  await autosave()
  expect(mocks.patch).toHaveBeenCalledTimes(1)
  expect(mocks.patch.mock.calls[0][0]).toBe('/api/assistants/B')
})

test('aborts an in-flight save and ignores its late response after navigation', async () => {
  const response = deferred<{ data: undefined }>()
  mocks.patch.mockReturnValue(response.promise)
  await navigate('A')
  await edit()
  await autosave()
  const signal = mocks.patch.mock.calls[0][2] as AbortSignal
  await navigate('B')
  expect(signal.aborted).toBe(true)
  await act(async () => response.resolve({ data: undefined }))
  expect(container.querySelector('[data-testid="edit"]')?.textContent).toBe('Edit B')
  expect(mocks.get.mock.calls.filter(([url]) => url === '/api/assistants/A')).toHaveLength(1)
})

test('ignores a late editor load after moving to a different assistant', async () => {
  const response = deferred<{ data: dto.AssistantDraft }>()
  mocks.get.mockImplementation(async (url: string) =>
    url === '/api/assistants/A' ? response.promise : { data: draft('B') }
  )
  await navigate('A')
  await navigate('B')
  await act(async () => response.resolve({ data: draft('A') }))
  expect(container.querySelector('[data-testid="edit"]')?.textContent).toBe('Edit B')
  await edit()
  await autosave()
  expect(mocks.patch.mock.calls[0][0]).toBe('/api/assistants/B')
})
