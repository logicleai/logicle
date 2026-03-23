export const TABLEAU_10 = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
]

export const OTHER_COLOR = '#000000'
export const OTHER_KEY = '__OTHER__'
export const MAX_SERIES = 10

export function buildColorMap(
  items: { id: string | null; messages: number }[]
): Map<string, string> {
  const sorted = [...items].sort((a, b) => b.messages - a.messages)
  const map = new Map<string, string>()
  sorted.slice(0, MAX_SERIES).forEach((item, i) => {
    if (item.id) map.set(item.id, TABLEAU_10[i])
  })
  return map
}
