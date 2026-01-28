import { MutableRefObject, useContext } from 'react'
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

const AuthorizeMessage = () => {
  const { t } = useTranslation()
  const { sendMessage } = useContext(ChatPageContext)
  const onAllowClick = (allow: boolean) => {
    sendMessage?.({
      msg: {
        role: 'tool-auth-response',
        allow,
      },
    })
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
}: {
  message: UIMessage
  isLastMessage: boolean
  fireEdit: MutableRefObject<(() => void) | null>
}) => {
  switch (message.role) {
    case 'tool-auth-response':
      return null
    case 'assistant':
      return <AssistantMessage fireEdit={fireEdit} message={message}></AssistantMessage>
    case 'tool-auth-request':
      if (isLastMessage) return <AuthorizeMessage />
      else return null
    case 'tool':
      return <ToolMessage message={message} />
    default:
      return <div>{`Unsupported role ${message.role}`}</div>
  }
}

AssistantGroupMessage.displayName = 'ChatMessageBody'
