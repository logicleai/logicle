// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ChatPageContext, { type ChatPageContextProps } from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'
import { AssistantGroupMessage } from '@/app/chat/components/ChatMessage'
import type * as dto from '@/types/dto'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('react-loader-spinner', () => ({ RotatingLines: () => null }))
vi.mock('@/app/chat/components/AssistantMessage', () => ({ AssistantMessage: () => null }))
vi.mock('@/app/chat/components/ToolMessage', () => ({ ToolMessage: () => null }))

const request: dto.UserRequestMessage = {
  id: 'pause',
  role: 'user-request',
  conversationId: 'c1',
  parent: 'last-tool',
  sentAt: '2026-10-14T00:00:00.000Z',
  request: { type: 'tool-step-limit', maxIterations: 30 },
}
let container: HTMLDivElement
let root: Root
const sendMessage = vi.fn()

const render = async (isLastMessage = true, busy = false, readOnly = false) => {
  await act(async () =>
    root.render(
      <ChatPageContext.Provider
        value={
          {
            state: {
              ...defaultChatPageState,
              chatStatus: busy ? { state: 'sending', messageId: 'response' } : { state: 'idle' },
            },
            sendMessage: readOnly ? undefined : sendMessage,
          } as ChatPageContextProps
        }
      >
        <AssistantGroupMessage
          message={request}
          isLastMessage={isLastMessage}
          fireEdit={{ current: null }}
        />
      </ChatPageContext.Provider>
    )
  )
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  sendMessage.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

test.each([true, false])('responds to the exact pending request (continue=%s)', async (allow) => {
  await render()
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'chat-tool-step-limit-description'
  )
  expect(container.textContent).toContain('chat-tool-step-limit-description')
  const buttons = container.querySelectorAll('button')
  expect([...buttons].map((button) => button.textContent)).toEqual([
    'continue',
    'chat-tool-step-limit-stop',
  ])
  expect(container.textContent).not.toContain('retry')
  await act(async () => buttons[allow ? 0 : 1]!.click())
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
    msg: { role: 'user-response', allow },
    requestId: request.id,
  })
})

test.each([false, true])(
  'disables decisions while busy or read-only (readOnly=%s)',
  async (readOnly) => {
    await render(true, !readOnly, readOnly)
    const buttons = container.querySelectorAll('button')
    expect([...buttons].every((button) => button.disabled)).toBe(true)
    await act(async () => buttons[0]!.click())
    expect(sendMessage).not.toHaveBeenCalled()
  }
)

test('hides the request after a decision or a later message', async () => {
  await render(false)
  expect(container.textContent).toBe('')
})
