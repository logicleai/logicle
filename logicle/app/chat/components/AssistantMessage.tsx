'use client'
import { FC, useContext, useMemo } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import * as dto from '@/types/dto'
import { Attachment } from './ChatMessage'
import { Upload } from '@/components/app/upload'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { RotatingLines } from 'react-loader-spinner'
import { MemoizedAssistantMessageMarkdown } from './AssistantMessageMarkdown'
import { Button } from '@/components/ui/button'
import { t } from 'i18next'

interface Props {
  message: dto.BaseMessage
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      citation: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

function convertMathToKatexSyntax(text: string) {
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g
  const res = text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock
    } else if (squareBracket) {
      return `$$${squareBracket}$$`
    } else if (roundBracket) {
      return `$${roundBracket}$`
    }
    return match
  })
  return res
}

function expandCitations(text: string, citations: dto.Citation[]): string {
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    if (num > 0 && num <= citations.length) {
      const citation = citations[num - 1]
      let url: string
      if (typeof citation == 'string') {
        url = citation
      } else {
        url = citation.url
      }
      return `[${numStr}](${url})`
    } else {
      return `[${numStr}]`
    }
  })
}

export function computeMarkdown(msg: dto.BaseMessage) {
  let text = convertMathToKatexSyntax(msg.content)
  if (msg.citations) {
    text = expandCitations(text, msg.citations)
  }
  return text
}

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

export const AssistantMessage: FC<Props> = ({ message }) => {
  const {
    state: { chatStatus },
    setSideBarContent,
  } = useContext(ChatPageContext)

  let className = 'prose flex-1 relative'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }

  const processedMarkdown = useMemo(
    () => computeMarkdown(message),
    [message.content, message.citations]
  )

  return (
    <div className="flex flex-col relative">
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
      {message.reasoning && (
        <Reasoning running={message.content.length == 0}>{message.reasoning}</Reasoning>
      )}
      {message.content.length == 0 ? (
        <div className={className}>
          <p></p>
        </div>
      ) : (
        <MemoizedAssistantMessageMarkdown className={className}>
          {processedMarkdown}
        </MemoizedAssistantMessageMarkdown>
      )}
      {(message.citations?.length ?? 0) > 0 && (
        <div>
          <Button
            variant="outline"
            size="small"
            rounded="full"
            onClick={() => setSideBarContent?.(message.citations!)}
          >
            {t('sources')}
          </Button>
        </div>
      )}
    </div>
  )
}
