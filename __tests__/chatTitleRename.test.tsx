// @vitest-environment jsdom

import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SWRConfig, useSWRConfig } from 'swr'
import ChatPageContext, { type ChatPageContextProps } from '@/app/chat/components/context'
import { Chatbar } from '@/app/chat/components/Chatbar'
import { ChatHeader } from '@/app/chat/components/ChatHeader'
import type { ChatPageState } from '@/app/chat/components/state'
import type { ConversationWithMessages } from '@/lib/chat/types'
import type * as dto from '@/types/dto'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/providers/userProfileContext', () => ({
  useUserProfile: () => ({ id: 'user-1', workspaces: [], pinnedAssistants: [] }),
}))
vi.mock('@/app/context/environmentProvider', () => ({
  useEnvironment: () => ({ enableChatFolders: false, enableChatSharing: false }),
}))
vi.mock('@/components/providers/layoutconfigContext', () => ({
  useLayoutConfig: () => ({ isMobile: false }),
}))
vi.mock('@/components/providers/confirmationContext', () => ({
  useConfirmationContext: () => ({ askConfirmation: vi.fn() }),
}))
vi.mock('@/components/ui/scroll-area', async () => {
  const { forwardRef } = await import('react')
  return {
    ScrollArea: forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
      ({ children, ...props }, ref) => (
        <div ref={ref} {...props}>
          {children}
        </div>
      )
    ),
  }
})
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ui/menu', () => ({
  Menu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MenuItem: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock('@/components/app/Avatars', () => ({ AssistantAvatar: () => null }))
vi.mock('@/app/chat/components/AssistantDropdown', () => ({ AssistantDropdown: () => null }))
vi.mock('@/app/chat/components/CreateFolderDialog', () => ({ CreateFolderDialog: () => null }))
vi.mock('@/app/chat/components/ChatFolder', () => ({ ChatFolder: () => null }))
vi.mock('@/app/chat/components/ConversationSearchDialog', () => ({
  ConversationSearchDialog: () => null,
}))

// The app uses SWR's global mutate; route it to this test's fresh cache.
let scopedMutate: typeof import('swr').mutate
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>()
  return {
    ...actual,
    mutate: (...args: Parameters<typeof actual.mutate>) => scopedMutate(...args),
  }
})

const originalTitle = 'Original title'
const conversationId = 'conversation-1'
const conversation = {
  id: conversationId,
  name: originalTitle,
  ownerId: 'user-1',
  assistantId: 'assistant-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMsgSentAt: null,
  folderId: null,
  assistant: { id: 'assistant-1', name: 'Assistant', iconUri: null },
} satisfies dto.ConversationWithFolder

function TestChat() {
  scopedMutate = useSWRConfig().mutate
  const [selectedConversation, setSelectedConversation] = useState<
    ConversationWithMessages | undefined
  >({ ...conversation, messages: [] })
  const context = {
    state: { selectedConversation } as ChatPageState,
    urlChatId: conversationId,
    setSelectedConversation,
    navigateToChat: vi.fn(),
    getConversationSnapshot: vi.fn(),
    loadConversation: vi.fn(),
    setNewChatAssistantId: vi.fn(),
  } satisfies ChatPageContextProps

  return (
    <ChatPageContext.Provider value={context}>
      <Chatbar />
      <ChatHeader assistant={{ id: 'assistant-1' } as dto.UserAssistant} />
    </ChatPageContext.Provider>
  )
}

let root: Root
let container: HTMLDivElement
let serverTitle: string

const sidebarTitle = () =>
  container.querySelector('[data-testid="conversation-item"] a span[title]')?.textContent
const headerTitle = () => container.querySelector('h3 button')?.textContent

async function expectTitles(title: string) {
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(sidebarTitle()).toBe(title)
    expect(headerTitle()).toBe(title)
  })
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const getSavedTitle = () => serverTitle

async function mountChatTitleTest() {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  serverTitle = originalTitle
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/conversations' && !init?.method) {
      return Response.json({
        conversations: [{ ...conversation, name: serverTitle }],
        nextCursor: null,
      })
    }
    if (url === '/api/me/folders') return Response.json([])
    if (url === `/api/conversations/${conversationId}` && init?.method === 'PATCH') {
      serverTitle = JSON.parse(String(init.body)).name
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter>
          <TestChat />
        </MemoryRouter>
      </SWRConfig>
    )
  )
  await expectTitles(originalTitle)
}

async function unmountChatTitleTest() {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
}

async function renameFromSidebar(title: string) {
  const renameButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'rename'
  )
  expect(renameButton).toBeDefined()
  await act(async () => renameButton!.click())

  const input = container.querySelector('[data-testid="conversation-item"] input')
  expect(input).toBeInstanceOf(HTMLInputElement)
  await changeInput(input as HTMLInputElement, title)
  await act(async () => {
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

async function renameFromHeader(title: string) {
  const headerButton = container.querySelector('h3 button')
  expect(headerButton).toBeInstanceOf(HTMLButtonElement)
  await act(async () => (headerButton as HTMLButtonElement).click())

  const input = container.querySelector('h3 input')
  expect(input).toBeInstanceOf(HTMLInputElement)
  await changeInput(input as HTMLInputElement, title)
  await act(async () => {
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

beforeEach(async () => {
  await mountChatTitleTest()
})

afterEach(async () => {
  await unmountChatTitleTest()
})

test('renaming in the sidebar updates both the sidebar and header without a reload', async () => {
  await renameFromSidebar('Sidebar title')
  await expectTitles('Sidebar title')
  expect(getSavedTitle()).toBe('Sidebar title')
})

test('renaming in the header updates both the header and sidebar without a reload', async () => {
  await renameFromHeader('Header title')
  await expectTitles('Header title')
  expect(getSavedTitle()).toBe('Header title')
})
