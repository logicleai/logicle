import { FC } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { IUserMessageGroup } from '@/lib/chat/types'
import { UserMessage } from './UserMessage'
import { MessageError } from './ChatMessageError'
import { Attachment } from './Attachment'

interface Props {
  group: IUserMessageGroup
  isLast: boolean
}

export const UserMessageGroup: FC<Props> = ({ group, isLast }) => {
  const userProfile = useUserProfile()
  const avatarUrl = userProfile?.image
  const avatarFallback = userProfile?.name ?? ''
  const messageTitle = 'You'
  const uploads = (group.message.attachments ?? []).map((attachment) => {
    return {
      progress: 1,
      done: true,
      fileId: attachment.id,
      fileName: attachment.name,
      fileSize: attachment.size,
      fileType: attachment.mimetype,
    }
  })
  return (
    <div className="group flex p-4 text-base" style={{ overflowWrap: 'anywhere' }}>
      <div className="min-w-[40px]">
        <Avatar
          url={avatarUrl ?? undefined}
          fallback={avatarFallback}
          fallbackColor={stringToHslColor(userProfile?.id ?? '')}
        ></Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <h3>{messageTitle}</h3>
        {uploads.length != 0 && (
          <div className="flex flex-col gap-2">
            {uploads.map((file) => {
              return <Attachment key={file.fileId} file={file} className="w-[250px]"></Attachment>
            })}
          </div>
        )}
        <div className="w-full">
          <UserMessage
            message={group.message}
            enableActions={!group.message.error}
            group={group as IUserMessageGroup}
          ></UserMessage>
          {group.message.error && (
            <MessageError error={group.message.error} msgId={group.message.id}></MessageError>
          )}
        </div>
      </div>
    </div>
  )
}
