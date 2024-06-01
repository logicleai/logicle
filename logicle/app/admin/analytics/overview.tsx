import React from 'react'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'

interface BarData {
  name: string
  total: number
}

interface Params {
  data: BarData[]
}

export function Overview({ data }: Params) {
  const [barColor, setBarColor] = React.useState('')

  React.useEffect(() => {
    // Get the computed style of the body
    const computedStyle = getComputedStyle(document.body)
    // Read the --destructive CSS variable
    const color = computedStyle.getPropertyValue('--destructive').trim()
    setBarColor(color)
  }, [])
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
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
