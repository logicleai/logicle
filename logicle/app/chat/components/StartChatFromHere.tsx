import { useTranslation } from 'react-i18next'
import { IconSend } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { AssistantPin } from './AssistantPin'
import { AssistantAvatar } from '@/components/app/Avatars'
import { Button } from '@/components/ui/button'
import { AssistantDropdown } from './AssistantDropdown'

interface SplashParams {
  assistant: dto.UserAssistant
  className: string
  onPrompt: (prompt: string) => void
}

export const StartChatFromHere = ({ assistant, className, onPrompt }: SplashParams) => {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-row p-2">
        <AssistantDropdown assistant={assistant}></AssistantDropdown>
      </div>
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
        {assistant.prompts.length == 0 ? (
          <div className="flex flex-col m-auto items-center p-8 border border-primary_color w-[400px] max-w-[80%]">
            <IconSend size="18"></IconSend>
            <h2>{t('start_from_here')}</h2>
            <div className="text-center">{assistant.description}</div>
          </div>
        ) : (
          <div className="flex flex-row flex-wrap m-auto items-stretch p-8 max-w-[80%] gap-4">
            {assistant.prompts.map((prompt, index) => {
              return (
                <Button
                  key={index}
                  variant="outline"
                  className="w-40 border border-primary_color items-stretch justify-center"
                  onClick={() => onPrompt(prompt)}
                >
                  <div className="text-body1 text-ellipsis font-normal line-clamp-3 max-w-full whitespace-normal break-word text-balance">
                    {prompt}
                  </div>
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
