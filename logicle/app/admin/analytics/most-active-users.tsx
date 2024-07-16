import { LetterAvatar } from '@/components/ui'
import { useSWRJson } from '@/hooks/swr'

interface TokensByUser {
  userId: string
  name: string
  tokens: number
}

export function MostActiveUsers() {
  const { data } = useSWRJson<TokensByUser[]>('/api/analytics/usage/byuser')
  const tokensByUser = (data ?? []).slice(0, 5)
  return (
    <div className="space-y-8">
      {tokensByUser.map((t) => (
        <div className="flex items-center" key={t.userId}>
          <LetterAvatar name="OM"></LetterAvatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{t.name ?? t.userId}</p>
          </div>
          <div className="ml-auto font-medium">{t.tokens}</div>
        </div>
      ))}
    </div>
  )
}
