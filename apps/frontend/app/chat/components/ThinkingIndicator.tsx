import { FC } from 'react'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { stringToHslColor } from '@/components/ui/LetterAvatar'

interface Props {
  assistant: dto.AssistantIdentification
}

export const ThinkingIndicator: FC<Props> = ({ assistant }) => {
  return (
    <div className="flex p-4 text-base">
      <div className="min-w-[40px]">
        <Avatar
          url={assistant.iconUri ?? undefined}
          fallback={assistant.name}
          fallbackColor={stringToHslColor(assistant.id)}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3>{assistant.name}</h3>
        <div className="prose">
          <span style={{ animation: 'blink 0.5s linear infinite' }}>▍</span>
        </div>
      </div>
    </div>
  )
}

ThinkingIndicator.displayName = 'ThinkingIndicator'
