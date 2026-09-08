import { useTranslation } from 'react-i18next'
import type { ImageCarouselSpec } from '@/lib/tools/customWidget'

interface Props {
  spec: ImageCarouselSpec
  resolveFileUrl: (fileId: string) => string
}

/**
 * Horizontally scrollable gallery. Pure CSS scroll-snap, no scripted behaviour.
 */
export const ImageCarousel = ({ spec, resolveFileUrl }: Props) => {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('image-carousel-label')}
      className="my-2 flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto rounded border p-2"
    >
      {spec.items.map((item, index) => (
        <figure
          key={item.fileId + index}
          className="m-0 flex w-full shrink-0 snap-start flex-col items-center"
        >
          <img
            src={resolveFileUrl(item.fileId)}
            alt={item.alt ?? item.label ?? ''}
            className="max-h-[480px] w-full object-contain"
          />
          {item.label && (
            <figcaption className="mt-1 text-center text-sm text-muted-foreground">
              {item.label}
            </figcaption>
          )}
        </figure>
      ))}
    </section>
  )
}
