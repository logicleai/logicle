'use client'

import { useSWRJson } from '@/hooks/swr'
import { AnalyticsUsageBreakdown } from '@/types/dto'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { OTHER_COLOR, OTHER_KEY, buildColorMap } from './colors'

interface StackedOverviewProps {
  query: string
  breakdown: 'user' | 'assistant'
  colorMap: Map<string, string>
  onRangeSelect?: (from: Date, to: Date) => void
}

const parseDate = (value: string) => new Date(value.replace(' ', 'T'))

const formatBucketLabel = (value: string, granularity: AnalyticsUsageBreakdown['granularity']) => {
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

export function StackedOverview({
  query,
  breakdown,
  colorMap,
  onRangeSelect,
}: StackedOverviewProps) {
  const { t } = useTranslation()
  const endpoint =
    breakdown === 'user'
      ? `/api/analytics/usage/byuser${query}`
      : `/api/analytics/usage/byassistant${query}`

  const { data } = useSWRJson<AnalyticsUsageBreakdown>(endpoint)

  const [selectionStart, setSelectionStart] = React.useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null)

  // Build id → display name map from the API rows
  const nameMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of data?.rows ?? []) {
      if (row.id && row.name && !map.has(row.id)) {
        map.set(row.id, row.name)
      }
    }
    return map
  }, [data])

  // Derive sorted unique buckets
  const buckets = React.useMemo(() => {
    if (!data) return []
    const seen = new Map<string, { start: string; end: string }>()
    for (const row of data.rows) {
      if (!seen.has(row.start)) seen.set(row.start, { start: row.start, end: row.end })
    }
    return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start))
  }, [data])

  // Pivot flat rows into Recharts stacked format
  const chartData = React.useMemo(() => {
    if (!data) return []
    return buckets.map((bucket) => {
      const rows = data.rows.filter((r) => r.start === bucket.start)
      const entry: Record<string, unknown> = {
        name: formatBucketLabel(bucket.start, data.granularity),
        bucketStart: bucket.start,
        bucketEnd: bucket.end,
        [OTHER_KEY]: 0,
      }
      for (const row of rows) {
        if (row.id && colorMap.has(row.id)) {
          entry[row.id] = ((entry[row.id] as number) ?? 0) + row.messages
        } else {
          entry[OTHER_KEY] = ((entry[OTHER_KEY] as number) ?? 0) + row.messages
        }
      }
      return entry
    })
  }, [data, buckets, colorMap])

  const finalizeSelection = (startIndex: number, endIndex: number) => {
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)
    const startBucket = buckets[minIndex]
    const endBucket = buckets[maxIndex]
    if (!startBucket || !endBucket) return
    onRangeSelect?.(parseDate(startBucket.start), parseDate(endBucket.end))
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
          x1: chartData[Math.min(selectionStart, selectionEnd)]?.name,
          x2: chartData[Math.max(selectionStart, selectionEnd)]?.name,
        }

  const isSelecting = selectionStart != null

  // Ordered series: colorMap entries in insertion order (already sorted by messages desc)
  const series = [...colorMap.entries()]

  return (
    <div className="h-full w-full" style={isSelecting ? { userSelect: 'none' } : undefined}>
      <ResponsiveContainer className="h-full w-full">
        <BarChart
          data={chartData}
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
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
          ) : null}
          {shade?.x1 && shade?.x2 ? (
            <ReferenceArea
              x1={shade.x1 as string}
              x2={shade.x2 as string}
              fill="hsl(var(--primary))"
              fillOpacity={0.18}
            />
          ) : null}
          {series.map(([id, color], index) => (
            <Bar
              key={id}
              dataKey={id}
              stackId="stack"
              fill={color}
              name={nameMap.get(id) ?? id}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
          <Bar
            dataKey={OTHER_KEY}
            stackId="stack"
            fill={OTHER_COLOR}
            name={t('other')}
            radius={series.length === 0 ? [4, 4, 0, 0] : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
