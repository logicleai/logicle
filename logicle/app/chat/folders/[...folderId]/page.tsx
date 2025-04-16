'use client'
import React, { useContext, useEffect } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { useParams } from 'next/navigation'
import { useSWRJson } from '@/hooks/swr'
import * as dto from '@/types/dto'

const FolderPage = () => {
  const {} = useContext(ChatPageContext)

  const { folderId } = useParams() as { folderId: string }
  const { data: conversations } = useSWRJson<dto.Conversation[]>(
    `/api/user/folders/${folderId}/conversations`
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {(conversations || []).map((c) => {
        return <div key={c.id}>{c.name}</div>
      })}
    </div>
  )
}

export default FolderPage
