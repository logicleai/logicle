'use client'
import { useContext } from 'react'
import * as dto from '@/types/dto'
import ChatPageContext, { SideBarContent } from '@/app/chat/components/context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconX } from '@tabler/icons-react'
import { nanoid } from 'nanoid'
import { Button } from '@/components/ui/button'

const Citation = ({ citation: citation_ }: { citation: dto.Citation }) => {
  const citation =
    typeof citation_ === 'string'
      ? {
          title: '',
          summary: '',
          url: citation_,
        }
      : citation_
  const parsedUrl = new URL(citation.url)
  const protocol = parsedUrl.protocol
  const fqdn = parsedUrl.hostname // e.g. "www.example.com"

  return (
    <button
      type="button"
      className="flex flex-col gap-2 text-left hover:bg-gray-100"
      onClick={() => {
        window.open(citation.url, '_blank', 'noopener,noreferrer')
      }}
    >
      <span className="flex items-center gap-2">
        <img src={`https://www.google.com/s2/favicons?domain=${protocol}//${fqdn}`}></img>
        <span>{fqdn}</span>
      </span>
      <span className="font-bold">{citation.title}</span>
      <span>{citation.summary}</span>
    </button>
  )
}

export const ConversationSidebar = ({
  content,
  className,
}: {
  content: SideBarContent
  className?: string
}) => {
  const { setSideBarContent } = useContext(ChatPageContext)
  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex">
        <div className="flex-1 text-h3 border-b-2 border-b-gray-200">{content.title}</div>
        <Button variant="ghost" onClick={() => setSideBarContent?.(undefined)}>
          <IconX></IconX>
        </Button>
      </div>
      <ScrollArea className="w-[400px] flex-1 overflow-hidden scroll-workaround p-2">
        <div className="flex flex-col gap-4">
          {content.type === 'tool-call-result' && (
            <div className="whitespace-pre-wrap break-all">
              {JSON.stringify(content.toolCallResult.result)}
            </div>
          )}
          {content.type === 'citations' &&
            content.citations.map((c) => {
              return <Citation key={nanoid()} citation={c}></Citation>
            })}
        </div>
      </ScrollArea>
    </div>
  )
}
