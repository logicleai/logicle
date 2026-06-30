import { useTranslation } from 'react-i18next'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dialog } from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { delete_, patch, post } from '@/lib/fetch'
import React, { useState } from 'react'
import type { ConversationSharing } from '@/types/dto/chat'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'

interface Params {
  conversationId: string
  onClose: () => void
}

export const CopyButton: React.FC<{ textToCopy: string; children: string }> = ({
  textToCopy,
  children,
}) => {
  const [justCopied, setJustCopied] = useState<boolean>(false)
  return (
    <Button
      className="flex gap-1"
      size="small"
      disabled={justCopied}
      onClick={async () => {
        await navigator.clipboard.writeText(textToCopy).then(() => {
          setJustCopied(true)
          setTimeout(() => {
            setJustCopied(false)
          }, 2000)
        })
      }}
    >
      {children}
      <span className={justCopied ? 'visible' : 'invisible'}>✔</span>
    </Button>
  )
}

export const ChatSharingList: React.FC<{ list: ConversationSharing[] }> = ({ list }) => {
  const { t } = useTranslation()
  const env = useEnvironment()
  if (list.length === 0) {
    return <>{t('conversation-is-not-currently-shared')}</>
  } else {
    return (
      <>
        <div>{t('chat-is-already-shared')}</div>
        {list.map((sharing) => {
          return (
            <div key={sharing.id} className="flex">
              <div className="flex-1 w-0 overflow-hidden text-ellipsis">{`${env.appUrl}/share/${sharing.id}`}</div>
              <CopyButton textToCopy={`${env.appUrl}/share/${sharing.id}`}>{t('copy')}</CopyButton>
            </div>
          )
        })}
      </>
    )
  }
}
export const ChatSharingDialog: React.FC<Params> = ({ conversationId, onClose }) => {
  const { t } = useTranslation()
  const { mutate, data, isLoading } = useSWRJson<ConversationSharing[]>(
    `/api/conversations/${conversationId}/share`,
    {
      keepPreviousData: false,
    }
  )
  const createLink = async () => {
    const response = await post<ConversationSharing>(`/api/conversations/${conversationId}/share`)
    if (response.error) {
      toast.error(t('failed-creating-link'))
      return
    }
    toast.success(t('link-created'))
    await mutate()
  }
  const updateLinks = async () => {
    const response = await patch<ConversationSharing>(
      `/api/conversations/${conversationId}/share`,
      {}
    )
    if (response.error) {
      toast.error(t('failed-updating-links'))
      return
    }
    toast.success(t('links-updated'))
    await mutate()
  }
  const unshare = async () => {
    const response = await delete_(`/api/conversations/${conversationId}/share`)
    if (response.error) {
      toast.error(t('failed-unsharing'))
      return
    }
    toast.success(t('conversation-unshared'))
    await mutate()
  }
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[48rem] flex flex-col">
        <DialogHeader className="font-bold">
          <DialogTitle>{t('conversation-sharing')}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          'Loading...'
        ) : (
          <>
            <ChatSharingList list={data || []}></ChatSharingList>
            <div className="flex gap-2">
              {(data?.length ?? 0) > 0 && (
                <>
                  <Button
                    onClick={async () => {
                      await updateLinks()
                    }}
                  >
                    {t('update-links')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await unshare()
                    }}
                  >
                    {t('unshare')}
                  </Button>
                </>
              )}
              {(data?.length ?? 0) === 0 && (
                <Button
                  onClick={async () => {
                    await createLink()
                  }}
                >
                  {t('create-link')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
