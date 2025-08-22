'use client'
import { FC, useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import * as dto from '@/types/dto'
import { Upload } from '@/components/app/upload'
import { Button } from '@/components/ui/button'
import { t } from 'i18next'
import { Attachment } from './Attachment'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface Props {
  message: dto.ToolMessage
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      citation: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

const ToolDebug = ({ debug }: { debug: dto.DebugPart }) => {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="item-1" style={{ border: 'none' }}>
        <AccordionTrigger className="py-1">
          <div className="text-sm overflow-hidden text-ellipsis nowrap text-start w-0 flex-1 whitespace-nowrap">
            {debug.displayMessage}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div>{JSON.stringify(debug.data, null, 2)}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export const ToolMessage: FC<Props> = ({ message }) => {
  const { setSideBarContent } = useContext(ChatPageContext)

  return (
    <div className="flex flex-col relative">
      {message.parts.map((part, index) => {
        if (part.type == 'debug') {
          return <ToolDebug key={index} debug={part} />
        } else {
          return undefined
        }
      })}
      {message.attachments.map((attachment) => {
        const upload: Upload = {
          progress: 1,
          fileId: attachment.id,
          fileName: attachment.name,
          fileSize: attachment.size,
          fileType: attachment.mimetype,
          done: true,
        }
        return <Attachment key={attachment.id} file={upload}></Attachment>
      })}
      {(message.citations?.length ?? 0) > 0 && (
        <div>
          <Button
            variant="secondary"
            size="small"
            rounded="full"
            onClick={() =>
              setSideBarContent?.({
                title: t('citations'),
                type: 'citations',
                citations: message.citations!,
              })
            }
          >
            {t('sources')}
          </Button>
        </div>
      )}
    </div>
  )
}
