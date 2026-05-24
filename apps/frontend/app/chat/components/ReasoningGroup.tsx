'use client'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { UIReasoningGroup, UIReasoningLikePart, UIReasoningPart } from '@/lib/chat/types'
import { FC, useState } from 'react'
import { RotatingLines } from 'react-loader-spinner'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { ToolCall } from './ChatMessage'
import { Reasoning } from './Reasoning'

export const ReasoningGroupPart: FC<{
  part: UIReasoningLikePart
  subAssistants?: dto.UserAssistant['subAssistants']
  assistantTools?: dto.UserAssistant['tools']
}> = ({ part, subAssistants, assistantTools }) => {
  if (part.type === 'tool-call') {
    return (
      <ToolCall
        toolCall={part}
        status={part.status}
        toolCallResult={part.result}
        subAssistants={subAssistants}
        assistantTools={assistantTools}
      />
    )
  } else if (part.type === 'reasoning') {
    const rp = part as UIReasoningPart
    return (
      <div>
        {rp.title && <div className="text-sm font-semibold">{rp.title}</div>}
        {rp.reasoning && <Reasoning text={rp.reasoning} />}
      </div>
    )
  } else {
    return null
  }
}

export const ReasoningGroup: FC<{
  group: UIReasoningGroup
  subAssistants?: dto.UserAssistant['subAssistants']
  assistantTools?: dto.UserAssistant['tools']
}> = ({ group, subAssistants, assistantTools }) => {
  const { t } = useTranslation()
  const { parts, running, title } = group

  const [open, setOpen] = useState('')

  if (!running && parts.length === 0) return null

  return (
    <Accordion type="single" collapsible value={open} onValueChange={setOpen}>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1" showChevron={false}>
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{title ?? t('thinking')}</div>
            {running && <RotatingLines width="16" height="16" strokeColor="gray" />}
          </div>
        </AccordionTrigger>
        <AccordionContent className="l-2 flex flex-col gap-2">
          {parts
            .filter((p) => p.type === 'reasoning' || p.type === 'tool-call')
            .map((part, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex flex-col items-center gap-2">
                  <span className="mt-2 w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                  <div className="mt-2 h-full w-[1px] bg-black" />
                </div>
                <div className="flex-1">
                  <ReasoningGroupPart
                    part={part}
                    subAssistants={subAssistants}
                    assistantTools={assistantTools}
                  />
                </div>
              </div>
            ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
