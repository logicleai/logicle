import { useContext } from 'react'
import * as dto from '@/types/dto'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'

const findAncestorUserMessage = (
  messages: dto.Message[],
  msgId: string
): dto.UserMessage | undefined => {
  const idToMessage = Object.fromEntries(messages.map((m) => [m.id, m]))
  let msg = idToMessage[msgId]
  while (msg) {
    if (msg.role == 'user') {
      return msg
    }
    if (!msg.parent) break
    msg = idToMessage[msg.parent]
  }
  return undefined
}

export const MessageError = ({ msgId, error }: { msgId: string; error: string }) => {
  const { t } = useTranslation()
  const { sendMessage, state } = useContext(ChatPageContext)
  return (
    <Alert variant="destructive" className="mt-2">
      <AlertDescription>
        <div className="flex items-center">
          <div className="flex-1">{t(error)} </div>
          {sendMessage && (
            <Button
              size="small"
              className="shrink-0"
              onClick={() => {
                const messageToRepeat = findAncestorUserMessage(
                  state.selectedConversation?.messages ?? [],
                  msgId
                )
                if (messageToRepeat) {
                  sendMessage({
                    msg: {
                      role: messageToRepeat.role,
                      content: messageToRepeat.content,
                      attachments: messageToRepeat.attachments,
                    },
                    repeating: messageToRepeat,
                  })
                }
              }}
            >
              {t('retry')}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
