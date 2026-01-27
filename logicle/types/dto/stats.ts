export interface UserUsageStats {
  userId: string
  name: string
  tokens: number
  messages: number
}

export interface MonthlyStats {
  date: string
  tokens: number
  messages: number
}

export type AnalyticsPeriod = 'last_week' | 'last_month' | 'last_year' | 'custom'

export type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month'

export interface AnalyticsUsageBucket {
  start: string
  end: string
  tokens: number
  messages: number
}

export interface AnalyticsUsageHistogram {
  period: AnalyticsPeriod
  granularity: AnalyticsGranularity
  from: string
  to: string
  buckets: AnalyticsUsageBucket[]
}
