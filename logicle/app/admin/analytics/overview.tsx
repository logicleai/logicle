import { useSWRJson } from '@/hooks/swr'
import { MonthlyStats } from '@/types/dto'
import React from 'react'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'

export function Overview() {
  const [barColor, setBarColor] = React.useState('')
  const { data } = useSWRJson<MonthlyStats[]>('/api/analytics/usage')

  const monthlyData = (data ?? [])
    .map((d) => {
      return {
        name: d.date.substring(0, 7),
        total: d.messages,
      }
    })
    .slice() // create a shallow copy
    .sort((d1, d2) => d1.name.localeCompare(d2.name))
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
