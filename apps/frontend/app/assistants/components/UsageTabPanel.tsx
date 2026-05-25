import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSWRJson } from '@/hooks/swr'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

interface Props {
  className: string
  visible: boolean
  assistantId?: string
}

export const UsageTabPanel = ({ visible, className, assistantId }: Props) => {
  const { t } = useTranslation()
  const { data: parents } = useSWRJson<dto.AssistantParent[]>(
    assistantId ? `/api/assistants/${assistantId}/usage` : null
  )

  return (
    <ScrollArea className={className} style={{ display: visible ? undefined : 'none' }}>
      <div className="flex flex-col gap-3 pr-2">
        {parents && parents.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('assistant_usage_empty')}</p>
        )}
        {parents && parents.length > 0 && (
          <>
            <p className="text-muted-foreground text-sm">{t('assistant_usage_used_by')}</p>
            <ul className="flex flex-col gap-2">
              {parents.map((parent) => (
                <li key={parent.id}>
                  <Link href={`/assistants/${parent.id}`}>{parent.name}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ScrollArea>
  )
}
