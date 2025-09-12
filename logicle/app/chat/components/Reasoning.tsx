import { FC } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { RotatingLines } from 'react-loader-spinner'
import { useTranslation } from 'react-i18next'

type Props = {
  title?: string
  body: string
  running: boolean
}

export const ReasoningBody: FC<{ text: string }> = ({ text }) => {
  return <div className="prose whitespace-pre-wrap">{text}</div>
}

export const Reasoning: FC<Props> = ({ title, body, running }: Props) => {
  const { t } = useTranslation()
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1" showChevron={false}>
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{title ?? t('reasoning')}</div>
            {running && <RotatingLines width="16" strokeColor="gray" />}
          </div>
        </AccordionTrigger>

        {body.length !== 0 && (
          <AccordionContent className="border-l-4 border-gray-400 pl-2">
            <ReasoningBody text="" />
          </AccordionContent>
        )}
      </AccordionItem>
    </Accordion>
  )
}
