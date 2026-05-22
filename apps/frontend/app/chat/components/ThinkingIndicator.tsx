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
        <div className="flex gap-1 mt-2">
          <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" />
        </div>
      </div>
    </div>
  )
}

ThinkingIndicator.displayName = 'ThinkingIndicator'
