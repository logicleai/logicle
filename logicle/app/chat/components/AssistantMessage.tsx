'use client'
import { FC, MutableRefObject, useContext, useMemo, useRef, useState } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import * as dto from '@/types/dto'
import { Upload } from '@/components/app/upload'
import { MemoizedAssistantMessageMarkdown } from './AssistantMessageMarkdown'
import { Button } from '@/components/ui/button'
import { t } from 'i18next'
import { Attachment } from './Attachment'
import { Reasoning } from './Reasoning'
import { AssistantMessageEdit } from './AssistantMessageEdit'
import { computeMarkdown } from './markdown/process'
import { AssistantMessagePartEx, AssistantMessageEx } from '@/lib/chat/types'
import { ToolCall } from './ChatMessage'

interface Props {
  message: AssistantMessageEx
  fireEdit?: MutableRefObject<(() => void) | null>
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      citation: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

export const AssistantMessagePart: FC<{
  block: AssistantMessagePartEx
  running: boolean
}> = ({ block, running }) => {
  if (block.type == 'tool-call') {
    return <ToolCall toolCall={block} status={block.status} toolCallResult={block.result} />
  } else if (block.type == 'reasoning') {
    return <Reasoning running={running}>{block.reasoning}</Reasoning>
  } else {
    return <></>
  }
}
export const AssistantMessage: FC<Props> = ({ fireEdit, message }) => {
  const {
    state: { chatStatus },
    setSideBarContent,
  } = useContext(ChatPageContext)
  const markdownRef = useRef<HTMLDivElement>(null)
  let className = 'prose flex-1 relative'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }
  const [isEditing, setIsEditing] = useState(false)
  const [editorHeight, setEditorHeight] = useState(200)
  if (fireEdit) {
    fireEdit.current = () => {
      if (markdownRef.current) {
        const currentHeight = markdownRef.current.scrollHeight
        setEditorHeight(currentHeight)
      }
      setIsEditing(true)
    }
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
      {message.parts.map((b, index) => {
        // Reasoning will stop when first content is received. Makes no sense
        return <AssistantMessagePart key={index} block={b} running={message.content.length == 0} />
      })}
      {isEditing ? (
        <AssistantMessageEdit
          onClose={() => setIsEditing(false)}
          message={message}
          height={editorHeight}
        ></AssistantMessageEdit>
      ) : (
        <MemoizedAssistantMessageMarkdown ref={markdownRef} className={className}>
          {processedMarkdown}
        </MemoizedAssistantMessageMarkdown>
      )}
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
