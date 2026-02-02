import { MutableRefObject, useContext, useEffect, useMemo, useState } from 'react'
import { RotatingLines } from 'react-loader-spinner'
import { AssistantMessage } from './AssistantMessage'
import * as dto from '@/types/dto'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import { UIMessage } from '@/lib/chat/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { useEnvironment } from '@/app/context/environmentProvider'
import { ToolMessage } from './ToolMessage'
import { useSWRConfig } from 'swr'

const AuthorizeMessage = ({
  message,
  toolAvailability,
  assistantId,
}: {
  message: dto.UserRequestMessage
  toolAvailability?: 'ok' | 'require-auth'
  assistantId?: string
}) => {
  const { t } = useTranslation()
  const { sendMessage } = useContext(ChatPageContext)
  const { mutate } = useSWRConfig()
  const auth = message.request
  const mcpAuth = auth?.type === 'mcp-oauth' ? auth : null
  const authUrl = useMemo(() => mcpAuth?.authorizationUrl ?? '', [mcpAuth])
  const connected = toolAvailability === 'ok'

  useEffect(() => {
    if (!mcpAuth) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; toolId?: string; returnUrl?: string }
      if (data?.type === 'mcp-oauth-complete' && data.toolId === mcpAuth.toolId) {
        if (data.returnUrl) {
          window.location.href = data.returnUrl
          return
        }
        if (assistantId) {
          void mutate(`/api/user/assistants/${assistantId}`)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [assistantId, mcpAuth, mutate])

  const onAllowClick = (allow: boolean) => {
    sendMessage?.({
      msg: {
        role: 'user-response',
        allow,
      },
    })
  }
  const onConnectClick = () => {
    if (!authUrl) return
    const url = new URL(authUrl, window.location.origin)
    url.searchParams.set('returnUrl', window.location.href)
    if (mcpAuth?.topLevelNavigation) {
      window.location.href = url.toString()
      return
    }
    const popup = window.open(url.toString(), 'mcp-oauth', 'width=720,height=860')
    if (!popup) {
      window.location.href = url.toString()
    }
  }

  if (mcpAuth) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-sm">
          {connected ? t('mcp_auth_connected') : t('mcp_auth_required')}
        </div>
        <div className="flex flex-horz gap-2">
          {connected ? (
            <Button size="small" onClick={() => onAllowClick(true)}>
              {t('continue')}
            </Button>
          ) : (
            <>
              <Button size="small" onClick={onConnectClick}>
                {t('connect')}
              </Button>
              <Button size="small" variant="secondary" onClick={() => onAllowClick(false)}>
                {t('deny')}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-horz gap-2">
      <Button size="small" onClick={() => onAllowClick(true)}>
        {t('allow')}
      </Button>
      <Button size="small" onClick={() => onAllowClick(false)}>
        {t('deny')}
      </Button>
    </div>
  )
}

export const ToolCall = ({
  toolCall,
  toolCallResult,
  status,
}: {
  toolCall: dto.ToolCall
  toolCallResult?: dto.ToolCallResult
  status: 'completed' | 'need-auth' | 'running'
}) => {
  const { t } = useTranslation()
  const { setSideBarContent } = useContext(ChatPageContext)
  const environment = useEnvironment()
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1" showChevron={false}>
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{`${t('invocation_of_tool')} ${toolCall.toolName}`}</div>
            {status === 'running' && (
              <RotatingLines height="16" width="16" strokeColor="gray"></RotatingLines>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex items-center">
            <div className="flex-1">
              <div>{`${t('parameters')}:`}</div>
              {Object.entries(toolCall.args).map(([key, value]) => (
                <div key={key}>{`${key}:${JSON.stringify(value)}`}</div>
              ))}
            </div>
            {toolCallResult && environment.enableShowToolResult && (
              <Button
                variant="secondary"
                rounded="full"
                size="small"
                onClick={() =>
                  setSideBarContent?.({
                    title: t('tool_call_result'),
                    type: 'tool-call-result',
                    toolCallResult: toolCallResult,
                  })
                }
              >
                {t('result')}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export const AssistantGroupMessage = ({
  message,
  isLastMessage,
  fireEdit,
  assistantTools,
  assistantId,
}: {
  message: UIMessage
  isLastMessage: boolean
  fireEdit: MutableRefObject<(() => void) | null>
  assistantTools?: dto.UserAssistant['tools']
  assistantId?: string
}) => {
  const mcpAuth =
    message.role === 'user-request' && message.request?.type === 'mcp-oauth'
      ? message.request
      : null
  switch (message.role) {
    case 'user-response':
      return null
    case 'assistant':
      return <AssistantMessage fireEdit={fireEdit} message={message}></AssistantMessage>
    case 'user-request':
      if (isLastMessage)
        return (
          <AuthorizeMessage
            message={message as dto.UserRequestMessage}
            toolAvailability={
              assistantTools?.find((tool) => {
                return tool.id === mcpAuth?.toolId
              })?.availability
            }
            assistantId={assistantId}
          />
        )
      else return null
    case 'tool':
      return <ToolMessage message={message} />
    default:
      return <div>{`Unsupported role ${message.role}`}</div>
  }
}

AssistantGroupMessage.displayName = 'ChatMessageBody'
