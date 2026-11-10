// @vitest-environment jsdom

import { transferableAbortController } from 'node:util'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { router as routeDefinitions } from '../apps/frontend-vite/src/router'

// Keep the production route tree and mobile guard; stub unrelated page content.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  createBrowserRouter: (routes: RouteObject[]) => routes,
}))
vi.mock('../apps/frontend-vite/src/RootLayout', async () => {
  const { Outlet } = await import('react-router-dom')
  const { default: LayoutConfigProvider } = await import(
    '@/components/providers/layoutconfigContext'
  )
  return {
    RootLayout: () => (
      <LayoutConfigProvider>
        <Outlet />
      </LayoutConfigProvider>
    ),
  }
})
vi.mock('../apps/frontend-vite/src/RouteError', () => ({ RouteError: () => <div>Error</div> }))
vi.mock('@/app/admin/layout', () => ({ default: () => null }))
vi.mock('@/app/me/layout', () => ({ default: () => null }))
vi.mock('@/app/images/layout', () => ({ default: () => null }))
vi.mock('@/app/satellites/layout', () => ({ default: () => null }))
vi.mock('@/app/auth/layout', () => ({ default: () => null }))
vi.mock('@/app/chat/layout', async () => ({
  default: (await import('react-router-dom')).Outlet,
}))
vi.mock('@/app/chat/components/ChatSection', () => ({ ChatSection: () => <div>New chat</div> }))
vi.mock('@/app/images/page', () => ({ default: () => <div>Images</div> }))
vi.mock('@/app/share/[shareId]/PageClient', async () => {
  const { useParams } = await import('react-router-dom')
  return { default: () => <div>Shared conversation {useParams().shareId}</div> }
})

let root: Root
let container: HTMLDivElement
let router: ReturnType<typeof createMemoryRouter>
let width: number
let listeners: Set<() => void>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  // Node's Request requires a Node AbortSignal, rather than jsdom's implementation.
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController()
      }
    }
  )
  width = 1280
  listeners = new Set()
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return width <= 768
    },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  router?.dispose()
  container.remove()
  vi.unstubAllGlobals()
})

async function openPage(path: string) {
  router = createMemoryRouter(routeDefinitions as unknown as RouteObject[], {
    initialEntries: [path],
  })
  await act(async () => {
    root.render(<RouterProvider router={router} />)
    await vi.waitFor(() => expect(router.state.initialized).toBe(true))
  })
}

test.each([390, 768, 769, 1280])(
  'opens a shared conversation at width %i',
  async (viewportWidth) => {
    width = viewportWidth
    await openPage('/share/shared-chat-id')
    expect(router.state.location.pathname).toBe('/share/shared-chat-id')
    expect(container.textContent).toBe('Shared conversation shared-chat-id')
  }
)

test('keeps the shared conversation when switching to mobile and back', async () => {
  await openPage('/share/shared-chat-id')
  for (const viewportWidth of [390, 1280]) {
    await act(async () => {
      width = viewportWidth
      listeners.forEach((listener) => listener())
    })
    expect(router.state.location.pathname).toBe('/share/shared-chat-id')
    expect(container.textContent).toBe('Shared conversation shared-chat-id')
  }
})

test('still redirects restricted pages to chat on mobile', async () => {
  width = 390
  await openPage('/images')
  await act(async () => {
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
  })
  expect(container.textContent).toBe('New chat')
})
