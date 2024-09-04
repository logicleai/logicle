import { UserAssistant } from '@/types/dto'
import { Avatar, avatarVariants } from '@/components/ui/avatar'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { VariantProps } from 'class-variance-authority'

interface Props extends VariantProps<typeof avatarVariants> {
  assistant: UserAssistant
  className?: string
}

export const AssistantAvatar = ({ size, assistant, className }: Props) => {
  return (
    <Avatar
      size={size}
      className={className}
      url={assistant.iconUri ?? undefined}
      fallback={assistant.name}
      fallbackColor={stringToHslColor(assistant.id)}
    />
  )
}
