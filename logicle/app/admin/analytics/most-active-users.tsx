import { LetterAvatar } from '@/components/ui'
import { useSWRJson } from '@/hooks/swr'
import { UserUsageStats } from '@/types/dto'

export function MostActiveUsers() {
  const { data } = useSWRJson<UserUsageStats[]>('/api/analytics/activity/byuser')
  const activityByUser = (data ?? []).slice(0, 5)
  return (
    <div className="space-y-8">
      {activityByUser.toSorted((a,b)=>b.messages - a.messages).map((t) => (
        <div className="flex items-center" key={t.userId}>
          <LetterAvatar name="OM"></LetterAvatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{t.name ?? t.userId}</p>
          </div>
          <div className="ml-auto font-medium">{t.messages}</div>
        </div>
      ))}
    </div>
  )
}
