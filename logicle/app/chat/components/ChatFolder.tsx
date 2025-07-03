import { Button } from '@/components/ui/button'
import { DndData } from '@/lib/dnd'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { useRouter } from 'next/navigation'
import React from 'react'

type Params = {
  folder: dto.ConversationFolder
}

export const ChatFolder: React.FC<Params> = ({ folder }) => {
  const router = useRouter()

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  const handleDrop = async (evt: React.DragEvent) => {
    evt.preventDefault()
    const dndData = JSON.parse(evt.dataTransfer.getData('application/json')) as DndData
    if (dndData.type == 'chat') {
      console.log(`Dropped chat ${dndData.id}`)
      await post(`/api/user/folders/${folder.id}`, {
        conversationId: dndData.id,
      })
    }
  }
  const handleClick = async () => {
    router.push(`/chat/folders/${folder.id}`)
  }
  return (
    <Button
      variant="ghost"
      size="link"
      className="text-h3 p-2"
      key={folder.id}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div
        className={`relative flex-1 overflow-hidden text-ellipsis whitespace-nowrap break-all text-left text-h3 pr-1`}
      >
        {folder.name}
      </div>
    </Button>
  )
}
