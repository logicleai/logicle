import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { IconInfoCircle } from '@tabler/icons-react'
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
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2"
    >
      <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 text-sm">
        <IconInfoCircle size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{t('chat-tool-step-limit-description')}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button size="small" disabled={disabled} onClick={() => respond(true)}>
          {t('continue')}
        </Button>
        <Button size="small" variant="secondary" disabled={disabled} onClick={() => respond(false)}>
          {t('chat-tool-step-limit-stop')}
        </Button>
      </div>
    </div>
  )
}
