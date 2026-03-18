import { useSWRJson } from '@/hooks/swr'
import { AnalyticsUsageHistogram } from '@/types/dto'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Bar, BarChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface OverviewProps {
  query: string
  onRangeSelect?: (from: Date, to: Date) => void
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

export function Overview({ query, onRangeSelect }: OverviewProps) {
  const { t } = useTranslation()
  const [barColor, setBarColor] = React.useState('')
  const { data } = useSWRJson<AnalyticsUsageHistogram>(`/api/analytics/usage${query}`)
  const [selectionStart, setSelectionStart] = React.useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null)

  const sortedBuckets = (data?.buckets ?? [])
    .map((bucket) => {
      return {
        ...bucket,
        sortKey: bucket.start,
      }
    })
    .slice()
    .sort((d1, d2) => d1.sortKey.localeCompare(d2.sortKey))

  const usageData = sortedBuckets.map((bucket) => {
    return {
      name: formatBucketLabel(bucket.start, data?.granularity ?? 'day'),
      total: bucket.messages,
      start: bucket.start,
      end: bucket.end,
    }
  })

  const finalizeSelection = (startIndex: number, endIndex: number) => {
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)
    const startBucket = sortedBuckets[minIndex]
    const endBucket = sortedBuckets[maxIndex]
    if (!startBucket || !endBucket) return
    const startDate = parseDate(startBucket.start)
    const endDate = parseDate(endBucket.end)
    onRangeSelect?.(startDate, endDate)
  }

  const handleMouseDown = (event: { activeTooltipIndex?: number }) => {
    if (event.activeTooltipIndex == null) return
    setSelectionStart(event.activeTooltipIndex)
    setSelectionEnd(event.activeTooltipIndex)
  }

  const handleMouseMove = (event: { activeTooltipIndex?: number }) => {
    if (selectionStart == null || event.activeTooltipIndex == null) return
    setSelectionEnd(event.activeTooltipIndex)
  }

  const handleMouseUp = () => {
    if (selectionStart == null || selectionEnd == null) return
    if (selectionStart !== selectionEnd) {
      finalizeSelection(selectionStart, selectionEnd)
    }
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  const shade =
    selectionStart == null || selectionEnd == null
      ? null
      : {
          x1: usageData[Math.min(selectionStart, selectionEnd)]?.name,
          x2: usageData[Math.max(selectionStart, selectionEnd)]?.name,
        }
  const isSelecting = selectionStart != null
  React.useEffect(() => {
    // Get the computed style of the body
    const computedStyle = getComputedStyle(document.body)
    // Read the --destructive CSS variable
    const color = computedStyle.getPropertyValue('--destructive').trim()
    setBarColor(color)
  }, [])
  return (
    <div
      className="h-full w-full"
      style={isSelecting ? { userSelect: 'none' } : undefined}
    >
      <ResponsiveContainer className="h-full w-full">
      <BarChart
        data={usageData}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        {selectionStart == null ? (
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            formatter={(value) => [`${value}`, t('messages')]}
          />
        ) : null}
        {shade?.x1 && shade?.x2 ? (
          <ReferenceArea
            x1={shade.x1}
            x2={shade.x2}
            fill="hsl(var(--primary))"
            fillOpacity={0.18}
          />
        ) : null}
        <Bar dataKey="total" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
