// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  mutate: vi.fn(),
  role: 'ADMIN',
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/fetch', () => ({ post: mocks.post, patch: vi.fn() }))
vi.mock('@/hooks/satellites', () => ({
  mutateSatellites: mocks.mutate,
  mutateAdminSatellites: mocks.mutate,
}))
vi.mock('@/components/providers/userProfileContext', () => ({
  useUserProfile: () => ({
    id: 'owner',
    role: mocks.role,
    workspaces: [{ id: 'w1', name: 'Workspace One', role: 'EDITOR' }],
  }),
}))
vi.mock('@/app/satellites/components/SatelliteSecretDialog', () => ({
  SatelliteSecretDialog: () => <div>created-secret</div>,
}))
// Keep cmdk's ResizeObserver/scrolling machinery out of the form interaction tests.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: () => null,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}))

import { SatelliteDialog } from '@/app/satellites/components/SatelliteDialog'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  mocks.role = 'ADMIN'
  mocks.post.mockResolvedValue({ data: { id: 'satellite', secret: 'secret' } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function renderForm() {
  await act(async () => root.render(<SatelliteDialog mode="create" onClose={vi.fn()} />))
  const input = document.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Satellite'
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const button = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((element) => element.textContent === text)!
const radio = (value: string) =>
  document.querySelector<HTMLButtonElement>(`[role="radio"][value="${value}"]`)!
const submit = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!

test('creation sends the selected public sharing and then shows the connection secret', async () => {
  await renderForm()
  await act(async () => radio('public').click())
  await act(async () => submit().click())
  expect(mocks.post).toHaveBeenCalledWith('/api/me/satellites', {
    name: 'Satellite',
    sharing: { type: 'public' },
  })
  expect(document.body.textContent).toContain('created-secret')
})

test('workspace selection does not submit the form and requires a workspace before creation', async () => {
  await renderForm()
  await act(async () => radio('workspace').click())
  expect(submit().disabled).toBe(true)
  await act(async () => document.querySelector<HTMLButtonElement>('[role="combobox"]')!.click())
  expect(mocks.post).not.toHaveBeenCalled()
  await act(async () => button('Workspace One').click())
  expect(submit().disabled).toBe(false)
  await act(async () => submit().click())
  expect(mocks.post).toHaveBeenCalledWith('/api/me/satellites', {
    name: 'Satellite',
    sharing: { type: 'workspace', workspaces: ['w1'] },
  })
})

test('ordinary users start private and cannot select company-wide sharing', async () => {
  mocks.role = 'USER'
  await renderForm()
  expect(radio('public').disabled).toBe(true)
  await act(async () => submit().click())
  expect(mocks.post).toHaveBeenCalledWith('/api/me/satellites', {
    name: 'Satellite',
    sharing: { type: 'private' },
  })
})
