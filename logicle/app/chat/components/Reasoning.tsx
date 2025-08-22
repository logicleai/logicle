'use client'
import { FC } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { RotatingLines } from 'react-loader-spinner'

interface Props {
  running: boolean
  text: string
}

export const Reasoning: FC<Props> = ({ text, running }: Props) => {
  const { t } = useTranslation()
  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1">
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{`${t('reasoning')}`}</div>
            {running && <RotatingLines width="16" strokeColor="gray"></RotatingLines>}
          </div>
        </AccordionTrigger>
        {text.length !== 0 && (
          <AccordionContent className="border-l-4 border-gray-400 pl-2">
            <div className="prose whitespace-pre-wrap">{text}</div>
          </AccordionContent>
        )}
      </AccordionItem>
    </Accordion>
  )
}
