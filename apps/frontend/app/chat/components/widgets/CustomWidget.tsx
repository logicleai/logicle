import { useTranslation } from 'react-i18next'
import type { WidgetSpec } from '@/lib/widgets/customWidget'
import { ImageCompare } from './ImageCompare'
import { ImageCarousel } from './ImageCarousel'

const resolveFileUrl = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/content`

/**
 * Renders a parsed `custom_widget` fence spec. Validation happened in
 * `parseCustomWidget`; this only maps a widget `type` to its trusted component.
 * `resolveFileUrl` stays frontend-only — `/api/files/{id}/content` authorizes
 * per user, so a bad `fileId` in a fence just fails to load.
 */
export const CustomWidget = ({ spec }: { spec: WidgetSpec }) => {
  const { t } = useTranslation()
  switch (spec.type) {
    case 'image-compare':
      return <ImageCompare spec={spec} resolveFileUrl={resolveFileUrl} />
    case 'image-carousel':
      return <ImageCarousel spec={spec} resolveFileUrl={resolveFileUrl} />
    default:
      return (
        <div className="my-2 rounded border border-dashed p-2 text-sm text-muted-foreground">
          {t('custom-widget-unavailable')}
        </div>
      )
  }
}

export const CustomWidgetFallback = ({ message }: { message: string }) => (
  <div className="my-2 rounded border border-dashed p-2 text-sm text-muted-foreground">
    {message}
  </div>
)
