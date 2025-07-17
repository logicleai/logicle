import { FC, memo, useContext, useState } from 'react'

import React from 'react'
import * as dto from '@/types/dto'
import { IMessageGroup } from '@/lib/chat/types'
import { AssistantMessageGroup } from './AssistantMessageGroup'
import { UserMessageGroup } from './UserMessageGroup'

interface Props {
  assistant: dto.AssistantIdentification
  group: IMessageGroup
  isLast: boolean
}

export const MessageGroup: FC<Props> = ({ assistant, group, isLast }) => {
  if (group.actor == 'assistant') {
    return <AssistantMessageGroup assistant={assistant} group={group} isLast={isLast} />
  } else {
    return <UserMessageGroup group={group} isLast={isLast} />
  }
}
MessageGroup.displayName = 'MessageGroup'
