import { useMemo } from 'react'
import { parseCustomWidget } from '@/lib/widgets/parseCustomWidget'
import { CustomWidget, CustomWidgetFallback } from './CustomWidget'

/**
 * Renders the body of a ```custom_widget Markdown fence. Parses the YAML DSL
 * and validates it; on any failure shows an isolated fallback box so the rest
 * of the message stays intact.
 */
export const CustomWidgetFence = ({ source }: { source: string }) => {
  const result = useMemo(() => parseCustomWidget(source), [source])
  if (!result.ok) {
    return <CustomWidgetFallback message={result.error} />
  }
  return <CustomWidget spec={result.spec} />
}
