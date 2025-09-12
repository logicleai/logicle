import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { UIAssistantMessage, UIReasoningPart, UIToolCallPart } from '@/lib/chat/types'
import { FC, MutableRefObject } from 'react'
import { RotatingLines } from 'react-loader-spinner'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { AssistantMessagePart } from './AssistantMessage'
import { ToolCall } from './ChatMessage'
import { Reasoning, ReasoningBody } from './Reasoning'

interface Props {
  message: UIAssistantMessage
  parts: UIReasoningLikePart[]
  fireEdit?: MutableRefObject<(() => void) | null>
}

export type UIReasoningLikePart = UIReasoningPart | UIToolCallPart | dto.BuiltinToolCallResultPart

export type UIReasoningGroup = {
  type: 'reasoning-group'
  parts: UIReasoningLikePart[]
}

export const ReasoningGroupPart: FC<{
  part: UIReasoningLikePart
}> = ({ part }) => {
  if (part.type === 'tool-call') {
    return <ToolCall toolCall={part} status={part.status} toolCallResult={part.result} />
  } else if (part.type === 'reasoning') {
    return <ReasoningBody text={part.reasoning} />
  } else {
    return null
  }
}

export const ReasoningGroup: FC<Props> = ({ message, fireEdit, parts }) => {
  const { t } = useTranslation()
  const lastPart = parts.length != 0 ? parts[parts.length - 1] : undefined
  const running = lastPart?.['running']
  const lastTitle = running ? lastPart?.['title'] : undefined
  const title = lastTitle ?? t('reasoning')
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1" showChevron={false}>
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{title}</div>
            {running && <RotatingLines width="16" strokeColor="gray" />}
          </div>
        </AccordionTrigger>
        <AccordionContent className="l-2">
          {parts
            .filter((p) => p.type == 'reasoning' || p.type == 'tool-call')
            .map((part, index) => {
              return (
                <div className="flex gap-2">
                  <div className="flex flex-col items-center gap-2">
                    <span className="mt-2 w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                    <div className="h-full w-[1px] bg-black"></div>
                  </div>
                  <ReasoningGroupPart key={index} part={part} />
                </div>
              )
            })}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
