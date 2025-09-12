import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { UIReasoningPart, UIToolCallPart } from '@/lib/chat/types'
import { FC } from 'react'
import { RotatingLines } from 'react-loader-spinner'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { ToolCall } from './ChatMessage'
import { ReasoningBody } from './Reasoning'

interface Props {
  parts: UIReasoningLikePart[]
}

export type UIReasoningLikePart = UIReasoningPart | UIToolCallPart | dto.BuiltinToolCallResultPart | dto.ToolCallResultPart

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

export const ReasoningGroup: FC<Props> = ({ parts }) => {
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
        <AccordionContent className="l-2 flex flex-col gap-2">
          {parts
            .filter((p) => p.type == 'reasoning' || p.type == 'tool-call')
            .map((part, index) => {
              return (
                <div className="flex gap-2">
                  <div className="flex flex-col items-center gap-2">
                    <span className="mt-2 w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                    <div className="mt-2 h-full w-[1px] bg-black"></div>
                  </div>
                  <div className="flex-1">
                    <ReasoningGroupPart key={index} part={part} />
                  </div>
                </div>
              )
            })}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
