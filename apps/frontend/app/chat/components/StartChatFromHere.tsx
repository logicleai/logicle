import { useTranslation } from 'react-i18next'
import { IconSend } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { AssistantAvatar } from '@/components/app/Avatars'
import { Button } from '@/components/ui/button'
import { AssistantDropdown } from './AssistantDropdown'
import { Badge } from '@/components/ui/badge'

interface SplashParams {
  assistant: dto.UserAssistant
  className: string
  onPrompt: (prompt: string) => void
}

export const StartChatFromHere = ({ assistant, className, onPrompt }: SplashParams) => {
  const { t } = useTranslation()
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex shrink-0 flex-row border-b px-4 py-2">
        <AssistantDropdown assistant={assistant}></AssistantDropdown>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 text-center">
          <AssistantAvatar size="big" className="h-16 w-16" assistant={assistant} />
          <h1 className="mt-1 text-2xl">{assistant?.name}</h1>
          <p className="max-w-[560px] text-sm text-muted-foreground">{assistant.description}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Badge variant="secondary">
              {t('model')}: {assistant.model}
            </Badge>
            {assistant.tools.length > 0 && (
              <Badge variant="secondary">
                {t('tools')}: {assistant.tools.length}
              </Badge>
            )}
            <Badge variant="secondary">{t('knowledge')}</Badge>
          </div>
          {assistant.prompts.length > 0 && (
            <div className="mt-8 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {assistant.prompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto min-h-20 items-start justify-start whitespace-normal rounded-xl border-border bg-background p-4 text-left font-normal leading-5 hover:border-primary hover:bg-primary-soft"
                  onClick={() => onPrompt(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          )}
          {assistant.prompts.length === 0 && (
            <div className="mt-12 flex max-w-[420px] flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
              <IconSend size={18} className="text-primary" />
              <h2>{t('start-from-here')}</h2>
              <p className="text-sm text-muted-foreground">{t('message-logicle')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
