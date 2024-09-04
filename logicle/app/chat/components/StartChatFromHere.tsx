import { useTranslation } from 'next-i18next'
import { IconSend } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { AssistantPin } from './AssistantPin'
import { AssistantAvatar } from '@/components/app/Avatars'

interface SplashParams {
  assistant: dto.UserAssistant
  className: string
}

export const StartChatFromHere = ({ assistant, className }: SplashParams) => {
  const { t } = useTranslation('common')
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="max-h-full overflow-x-hidden flex items-center">
        <div className="mx-auto flex flex-col gap-3 px-3 pt-12 align-center group">
          <h1 className="text-center">{t('new-chat-title')}</h1>
          <div className="flex flex-horz self-center">
            <div className="flex flex-col items-center">
              <AssistantAvatar size="big" assistant={assistant}></AssistantAvatar>
              <h3 className="text-center">{assistant?.name}</h3>
            </div>
            <AssistantPin assistant={assistant}></AssistantPin>
          </div>
        </div>
      </div>

      <div className="flex flex-col m-auto items-center p-8 border border-primary_color w-[400px] max-w-[80%]">
        <IconSend size="18"></IconSend>
        <h2>{t('start_from_here')}</h2>
        <div className="text-center">{assistant.description}</div>
      </div>
    </div>
  )
}
