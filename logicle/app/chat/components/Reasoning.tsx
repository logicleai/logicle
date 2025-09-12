import { FC, useMemo } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { RotatingLines } from 'react-loader-spinner'
import { useTranslation } from 'react-i18next'

type Props = {
  text: string
  running: boolean
}

export const Reasoning: FC<Props> = ({ text, running }: Props) => {
  const { t } = useTranslation()

  const { title, body } = useMemo(() => {
    const raw = text ?? ''
    const lines = raw.split(/\r?\n/)
    const first = (lines[0] ?? '').trim()

    // Case A: full-line bold => ** Title **
    const fullBoldMatch = first.match(/^\*\*(.+?)\*\*$/)
    if (fullBoldMatch) {
      return {
        title: fullBoldMatch[1].trim(),
        body: lines.slice(1).join('\n').trimStart(),
      }
    }

    // Case B: starts with ** but no closing ** yet (incomplete header)
    const startsBold = /^\*\*/.test(first)
    const hasClosingAfterStart = first.slice(2).includes('**')
    if (startsBold && !hasClosingAfterStart) {
      // Keep default title ("Reasoning"), clear body while streaming that first line
      return {
        title: t('reasoning'),
        body: '',
      }
    }

    // Fallback: default title + full body
    return {
      title: t('reasoning'),
      body: raw,
    }
  }, [text, t])

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1" showChevron={false}>
          <div className="flex flex-horz items-center gap-2">
            <div className="text-sm">{title}</div>
            {running && <RotatingLines width="16" strokeColor="gray" />}
          </div>
        </AccordionTrigger>

        {body.length !== 0 && (
          <AccordionContent className="border-l-4 border-gray-400 pl-2">
            <div className="prose whitespace-pre-wrap">{body}</div>
          </AccordionContent>
        )}
      </AccordionItem>
    </Accordion>
  )
}
