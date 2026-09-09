import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageCompareSpec } from '@/lib/widgets/customWidget'
import { cn } from '@/frontend/lib/utils'

interface Props {
  spec: ImageCompareSpec
  resolveFileUrl: (fileId: string) => string
}

/**
 * Two images occupying the same box; a click toggles between them. The toggle
 * is trusted app code (a `useState`), never model-authored JavaScript.
 */
export const ImageCompare = ({ spec, resolveFileUrl }: Props) => {
  const { t } = useTranslation()
  const [showSecond, setShowSecond] = useState(false)
  const [first, second] = spec.items
  const active = showSecond ? second : first

  return (
    <div className="my-2 inline-block max-w-full">
      <button
        type="button"
        onClick={() => setShowSecond((v) => !v)}
        aria-pressed={showSecond}
        aria-label={t('image-compare-toggle')}
        title={t('image-compare-toggle')}
        className="relative block max-w-full overflow-hidden rounded border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {spec.items.map((item, index) => (
          <img
            key={item.fileId + index}
            src={resolveFileUrl(item.fileId)}
            alt={item.alt ?? item.label ?? ''}
            className={cn('block h-auto max-w-full', (index === 1) === showSecond ? '' : 'hidden')}
          />
        ))}
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{active.label}</span>
        <span>{showSecond ? 2 : 1} / 2</span>
      </div>
    </div>
  )
}
