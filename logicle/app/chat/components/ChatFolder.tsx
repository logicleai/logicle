import { DndData } from '@/lib/dnd'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import React from 'react'

type Params = {
  folder: dto.ConversationFolder
}

export const ChatFolder: React.FC<Params> = ({ folder }) => {
  const handleDragOver = (event) => {
    event.preventDefault()
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
  }

  const handleDragLeave = () => {}

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
  return (
    <div className="p-2 text-h3" key={folder.id} onDrop={handleDrop} onDragOver={handleDragOver}>
      {folder.name}
    </div>
  )
}
