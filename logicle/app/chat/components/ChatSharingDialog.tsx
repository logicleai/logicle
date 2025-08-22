import { useTranslation } from 'react-i18next'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dialog } from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { patch, post } from '@/lib/fetch'
import React, { useState } from 'react'
import { ConversationSharing } from '@/db/schema'
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
    return <>{t('conversation_is_not_currently_shared')}</>
  } else {
    return (
      <>
        <div>{t('chat_is_already_shared')}</div>
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
      toast.error(t('failed_creating_link'))
      return
    }
    toast.success(t('link_created'))
    await mutate()
  }
  const updateLinks = async () => {
    const response = await patch<ConversationSharing>(
      `/api/conversations/${conversationId}/share`,
      {}
    )
    if (response.error) {
      toast.error(t('failed_updating_links'))
      return
    }
    toast.success(t('links_updated'))
    await mutate()
  }
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[48rem] flex flex-col">
        <DialogHeader className="font-bold">
          <DialogTitle>{t('conversation_sharing')}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          "Loading..."
        ) : (
          <>
            <ChatSharingList list={data || []}></ChatSharingList>
            <div className="flex gap-2">
              {(data?.length ?? 0) > 0 && (
                <Button
                  onClick={async () => {
                    await updateLinks()
                  }}
                >
                  {t('update_links')}
                </Button>
              )}
              {(data?.length ?? 0) === 0 && (
                <Button
                  onClick={async () => {
                    await createLink()
                  }}
                >
                  {t('create_link')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
