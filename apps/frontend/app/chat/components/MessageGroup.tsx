import { FC } from 'react'

import * as dto from '@/types/dto'
import { IMessageGroup } from '@/lib/chat/types'
import { AssistantMessageGroup } from './AssistantMessageGroup'
import { UserMessageGroup } from './UserMessageGroup'

interface Props {
  assistant: dto.AssistantIdentification & { tools?: dto.UserAssistant['tools'] }
  group: IMessageGroup
  isLast: boolean
  shareId?: string
}

export const MessageGroup: FC<Props> = ({ assistant, group, isLast, shareId }) => {
  if (group.actor === 'assistant') {
    return (
      <AssistantMessageGroup assistant={assistant} group={group} isLast={isLast} shareId={shareId} />
    )
  } else {
    return <UserMessageGroup group={group} />
  }
}
MessageGroup.displayName = 'MessageGroup'
