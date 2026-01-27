import { useSWRJson } from '@/hooks/swr'
import { AnalyticsUsageHistogram } from '@/types/dto'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface OverviewProps {
  query: string
}

const parseDate = (value: string) => {
  return new Date(value.replace(' ', 'T'))
}

const formatBucketLabel = (value: string, granularity: AnalyticsUsageHistogram['granularity']) => {
  const date = parseDate(value)
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })
  }
  if (granularity === 'day') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  if (granularity === 'week') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function Overview({ query }: OverviewProps) {
  const { t } = useTranslation()
  const [barColor, setBarColor] = React.useState('')
  const { data } = useSWRJson<AnalyticsUsageHistogram>(`/api/analytics/usage${query}`)

  const usageData = (data?.buckets ?? [])
    .map((bucket) => {
      return {
        name: formatBucketLabel(bucket.start, data?.granularity ?? 'day'),
        total: bucket.messages,
        sortKey: bucket.start,
      }
    })
    .slice()
    .sort((d1, d2) => d1.sortKey.localeCompare(d2.sortKey))
  React.useEffect(() => {
    // Get the computed style of the body
    const computedStyle = getComputedStyle(document.body)
    // Read the --destructive CSS variable
    const color = computedStyle.getPropertyValue('--destructive').trim()
    setBarColor(color)
  }, [])
  return (
    <ResponsiveContainer className="h-full w-full">
      <BarChart data={usageData}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          formatter={(value) => [`${value}`, t('messages')]}
        />
        <Bar dataKey="total" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
