'use client'
import { useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { useSWRJson } from '@/hooks/swr'
import { useTranslation } from 'react-i18next'
import type { UserImage } from '@/services/files'
import { IconCopy, IconDownload, IconEdit } from '@tabler/icons-react'
import { copyImageUrlToClipboard } from '@/frontend/lib/clipboard'

export default function ImagesPage() {
  const { t } = useTranslation()
  const { openImageEditor } = useContext(ChatPageContext)
  const { data: images } = useSWRJson<UserImage[]>(`/api/files/images`)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-h2 mb-4">{t('images')}</h2>
        {!images?.length ? (
          <div className="text-muted-foreground">{t('no-data')}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => (
              <div key={image.id} className="relative group rounded overflow-hidden border aspect-square">
                <img
                  alt={image.name}
                  src={`/api/files/${image.id}/content`}
                  className="w-full h-full object-contain bg-foreground/5"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <div className="flex flex-horz m-2 gap-1 absolute top-0 right-0 invisible group-hover:visible">
                  <button
                    type="button"
                    title={t('edit_image')}
                    className="bg-black bg-opacity-30 rounded-md"
                    onClick={() =>
                      openImageEditor?.(
                        {
                          id: image.id,
                          mimetype: image.type,
                          name: image.name,
                          size: image.size,
                        },
                        { startNewChat: true }
                      )
                    }
                  >
                    <IconEdit className="m-2" size={20} color="white" />
                  </button>
                  <button
                    type="button"
                    title={t('copy_to_clipboard')}
                    className="bg-black bg-opacity-30 rounded-md"
                    onClick={() => copyImageUrlToClipboard(`/api/files/${image.id}/content`)}
                  >
                    <IconCopy className="m-2" size={20} color="white" />
                  </button>
                  <button
                    type="button"
                    title={t('download')}
                    className="bg-black bg-opacity-30 rounded-md"
                    onClick={() => {
                      const link = document.createElement('a')
                      link.download = image.name
                      link.href = `/api/files/${image.id}/content`
                      link.style.display = 'none'
                      link.click()
                    }}
                  >
                    <IconDownload className="m-2" size={20} color="white" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
