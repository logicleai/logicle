import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import type * as dto from '@/types/dto'

export const ToolStepLimitMessage = ({ message }: { message: dto.UserRequestMessage }) => {
  const { t } = useTranslation()
  const { sendMessage, state } = useContext(ChatPageContext)
  const disabled = !sendMessage || state.chatStatus.state !== 'idle'
  const respond = (allow: boolean) => {
    sendMessage?.({
      msg: { role: 'user-response', allow },
      requestId: message.id,
    })
  }

  return (
    <div role="status" className="flex flex-col gap-2 rounded border p-3">
      <div className="text-sm font-medium">{t('chat-tool-step-limit-title')}</div>
      <div className="text-sm">{t('chat-tool-step-limit-description')}</div>
      <div className="flex gap-2">
        <Button size="small" disabled={disabled} onClick={() => respond(true)}>
          {t('continue')}
        </Button>
        <Button size="small" variant="secondary" disabled={disabled} onClick={() => respond(false)}>
          {t('chat-tool-step-limit-abort')}
        </Button>
      </div>
    </div>
  )
}
