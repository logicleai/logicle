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
