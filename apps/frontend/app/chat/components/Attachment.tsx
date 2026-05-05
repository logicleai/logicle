import { Upload } from '@/components/app/upload'
import { cn } from '@/frontend/lib/utils'
import { IconEdit, IconFile } from '@tabler/icons-react'
import { IconCopy } from '@tabler/icons-react'
import { IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { copyImageUrlToClipboard } from '@/frontend/lib/clipboard'

interface AttachmentProps {
  file: Upload
  className?: string
  conversationId?: string
}

export const isImage = (mimeType: string) => {
  return mimeType.startsWith('image/')
}

export const Attachment = ({ file, className, conversationId }: AttachmentProps) => {
  const { t } = useTranslation()
  const { openImageEditor } = useContext(ChatPageContext)

  return (
    <div
      className={cn(
        'border p-2 m-2 flex flex-row items-center relative shadow rounded relative group/attachment',
        className
      )}
    >
      <div className="overflow-hidden">
        {isImage(file.fileType) ? (
          <img alt="" src={`/api/files/${file.fileId}/content`}></img>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="bg-primary p-2 rounded">
              <IconFile color="white" size="24"></IconFile>
            </div>
            <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
              {file.fileName}
            </div>
          </div>
        )}
        <div className="flex flex-horz m-2 gap-1 absolute top-0 right-0 invisible group-hover/attachment:visible">
          {isImage(file.fileType) && openImageEditor && file.fileId && (
            <button
              type="button"
              title={t('edit_image')}
              className="bg-black bg-opacity-30 rounded-md"
              onClick={() =>
                openImageEditor(
                  {
                    id: file.fileId!,
                    mimetype: file.fileType,
                    name: file.fileName,
                    size: file.fileSize,
                  },
                  { conversationId, startNewChat: false }
                )
              }
            >
              <IconEdit className="m-2" size={24} color="white" />
            </button>
          )}
          {isImage(file.fileType) && (
            <button
              type="button"
              title={t('copy_to_clipboard')}
              className="bg-black bg-opacity-30 rounded-md"
              onClick={() => copyImageUrlToClipboard(`/api/files/${file.fileId}/content`)}
            >
              <IconCopy className="m-2" size={24} color="white"></IconCopy>
            </button>
          )}
          <button
            type="button"
            title={t('download')}
            className="bg-black bg-opacity-30 rounded-md"
            onClick={() => {
              const link = document.createElement('a')
              link.download = file.fileName
              link.href = `/api/files/${file.fileId}/content`
              link.style.display = 'none'
              link.click()
            }}
          >
            <IconDownload className="m-2" size={24} color="white"></IconDownload>
          </button>
        </div>
      </div>
    </div>
  )
}
