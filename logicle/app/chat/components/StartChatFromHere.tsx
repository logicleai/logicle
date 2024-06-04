import { useTranslation } from 'next-i18next'
import { IconSend } from '@tabler/icons-react'
import { Avatar } from '@/components/ui/avatar'
import { UserAssistant } from '@/types/chat'

interface SplashParams {
  assistant: UserAssistant
  className: string
}

export const StartChatFromHere = ({ assistant, className }: SplashParams) => {
  const { t } = useTranslation('common')
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="max-h-full overflow-x-hidden flex items-center">
        <div className="mx-auto flex flex-col gap-3 px-3 pt-12 align-center">
          <h1 className="text-center">{t('new-chat-title')}</h1>
          <div className="flex flex-col items-center">
            <Avatar
              url={assistant.icon ? `/api/images/${assistant.icon}` : undefined}
              fallback={assistant?.name ?? ''}
              size="big"
            ></Avatar>
          </div>
          <h3 className="text-center">{assistant?.name}</h3>
        </div>
      </div>

      <div className="flex flex-col m-auto items-center p-8 border border-primary_color w-[400px] max-w-[80%]">
        <IconSend size="18"></IconSend>
        <h2>Start from here</h2>
        <div className="text-center">{assistant.description}</div>
      </div>
    </div>
  )
}
