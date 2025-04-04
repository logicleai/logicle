import { FC, useContext, useState } from 'react'
import * as dto from '@/types/dto'
import ChatPageContext from './context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ChatSharingDialog } from './ChatSharingDialog'
import { useEnvironment } from '@/app/context/environmentProvider'
import { AssistantDropdown } from './AssistantDropdown'

interface Props {
  assistant: dto.UserAssistant
}

export const ChatHeader: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation()
  const environment = useEnvironment()
  const {
    state: { selectedConversation },
  } = useContext(ChatPageContext)
  const [showSharingDialog, setShowSharingDialog] = useState<boolean>(false)
  return (
    <div className="group flex flex-row justify-center px-2 gap-3 h-16 items-center">
      <AssistantDropdown assistant={assistant} />
      <h3 className="flex-1 text-center">{selectedConversation?.name}</h3>
      {environment.enableChatSharing && (
        <Button onClick={() => setShowSharingDialog(true)}>{t('share')}</Button>
      )}
      {showSharingDialog && (
        <ChatSharingDialog
          conversationId={selectedConversation?.id ?? ''}
          onClose={() => setShowSharingDialog(false)}
        ></ChatSharingDialog>
      )}
    </div>
  )
}
