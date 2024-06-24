import { FC } from 'react'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { AssistantPin } from './AssistantPin'
import { stringToHslColor } from '@/components/ui/LetterAvatar'

interface Props {
  assistant: dto.UserAssistant
}

const AssistantDescription: FC<Props> = ({ assistant }) => {
  return (
    <div className="group flex flex-row justify-center gap-3 h-16 items-center">
      <Avatar
        size="big"
        url={assistant.iconUri ?? undefined}
        fallback={assistant.name}
        fallbackColor={stringToHslColor(assistant.id)}
      />
      <h2 className=" flex justify-center py-2 bg-background">{assistant?.name ?? ''}</h2>
      <AssistantPin assistant={assistant}></AssistantPin>
    </div>
  )
}

export default AssistantDescription
