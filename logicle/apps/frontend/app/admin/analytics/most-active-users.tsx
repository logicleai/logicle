import { LetterAvatar } from '@/components/ui'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSWRJson } from '@/hooks/swr'
import { UserUsageStats } from '@/types/dto'

interface Params {
  className?: string
  query: string
}
export function MostActiveUsers({ className, query }: Params) {
  const { data } = useSWRJson<UserUsageStats[]>(`/api/analytics/activity/byuser${query}`)
  const activityByUser = data ?? []
  return (
    <ScrollArea className={`${className ?? ''} scroll-workaround`}>
      <div className="space-y-8">
        {activityByUser
          .slice()
          .sort((a, b) => b.messages - a.messages)
          .map((t) => (
            <div className="flex items-center" key={t.userId}>
              <LetterAvatar name="OM"></LetterAvatar>
              <div className="ml-4 space-y-1">
                <p className="text-sm font-medium leading-none">{t.name ?? t.userId}</p>
              </div>
              <div className="ml-auto font-medium">{t.messages}</div>
            </div>
          ))}
      </div>
    </ScrollArea>
  )
}
