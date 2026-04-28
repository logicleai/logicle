import { ScrollArea } from '@/components/ui/scroll-area'
import { UserUsageStats } from '@/types/dto'

interface Params {
  className?: string
  items: UserUsageStats[]
  colorMap: Map<string, string>
}

export function MostActiveUsers({ className, items, colorMap }: Params) {
  const sorted = [...items].sort((a, b) => b.messages - a.messages)
  return (
    <ScrollArea className={`${className ?? ''} scroll-workaround`}>
      <div className="space-y-8">
        {sorted.map((item) => {
          const color = colorMap.get(item.userId) ?? '#000000'
          return (
            <div className="flex items-center" key={item.userId}>
              <div
                className="h-4 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <div className="ml-4 space-y-1">
                <p className="text-sm font-medium leading-none">{item.name ?? item.userId}</p>
              </div>
              <div className="ml-auto font-medium">{item.messages}</div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
