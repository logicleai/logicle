'use client'
import { FC, useContext, useMemo } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { RotatingLines } from 'react-loader-spinner'

interface ReasoningProps {
  running: boolean
  children: string
}

export const Reasoning: FC<ReasoningProps> = ({ children, running }: ReasoningProps) => {
  const { t } = useTranslation()
  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1">
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{`${t('reasoning')}`}</div>
            {running ? <RotatingLines width="16" strokeColor="gray"></RotatingLines> : <></>}
          </div>
        </AccordionTrigger>
        <AccordionContent className="border-l-4 border-gray-400 pl-2">
          <div className="prose whitespace-pre-wrap">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
