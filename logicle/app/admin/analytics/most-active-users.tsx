import { LetterAvatar } from '@/components/ui'
import { useSWRJson } from '@/hooks/swr'

interface TokensByUser {
  userId: number
  tokens: number
}

export function MostActiveUsers() {
  const { isLoading, error, data } = useSWRJson<TokensByUser[]>('/api/analytics/usage/byuser')
  const tokensByUser = data ?? []
  return (
    <div className="space-y-8">
      {tokensByUser.map((t) => (
        <div className="flex items-center">
          <LetterAvatar name="OM"></LetterAvatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{t.userId}</p>
          </div>
          <div className="ml-auto font-medium">{t.tokens}</div>
        </div>
      ))}
    </div>
  )
}
