'use client'
import { useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { useSWRJson } from '@/hooks/swr'
import { useTranslation } from 'react-i18next'
import type { UserImage } from '@/services/files'

export default function ImagesPage() {
  const { t } = useTranslation()
  const { openImageEditor } = useContext(ChatPageContext)
  const { data: images } = useSWRJson<UserImage[]>(`/api/files/images`)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-h2 mb-4">{t('images')}</h2>
        {(images?.length ?? 0) === 0 ? (
          <div className="text-muted-foreground">{t('no-data')}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {images!.map((image) => (
              <button
                key={image.id}
                type="button"
                className="relative group rounded overflow-hidden border"
                title={image.name}
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
                <img
                  alt={image.name}
                  src={`/api/files/${image.id}/content`}
                  className="w-full h-28 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <div className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1 rounded">
                  {t('edit_image')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
