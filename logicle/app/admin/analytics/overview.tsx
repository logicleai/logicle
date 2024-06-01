import { useSWRJson } from '@/hooks/swr'
import React from 'react'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'

interface BarData {
  name: string
  total: number
}

interface Params {
  data: BarData[]
}

interface MonthlyTokens {
  date: string
  tokens: number
}

export function Overview() {
  const [barColor, setBarColor] = React.useState('')
  const { isLoading, error, data } = useSWRJson<MonthlyTokens[]>('/api/analytics/usage')

  const monthlyData = (data ?? []).map((d) => {
    return {
      name: d.date,
      total: d.tokens,
    }
  })

  React.useEffect(() => {
    // Get the computed style of the body
    const computedStyle = getComputedStyle(document.body)
    // Read the --destructive CSS variable
    const color = computedStyle.getPropertyValue('--destructive').trim()
    setBarColor(color)
  }, [])
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={monthlyData}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Bar dataKey="total" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
