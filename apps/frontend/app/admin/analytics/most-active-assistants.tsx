import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantUsageStats } from '@/types/dto'

interface Params {
  className?: string
  items: AssistantUsageStats[]
  colorMap: Map<string, string>
}

export function MostActiveAssistants({ className, items, colorMap }: Params) {
  const sorted = [...items].sort((a, b) => b.messages - a.messages)
  return (
    <ScrollArea className={`${className ?? ''} scroll-workaround`}>
      <div className="space-y-8">
        {sorted.map((item) => {
          const id = item.assistantId ?? ''
          const color = colorMap.get(id) ?? '#000000'
          return (
            <div className="flex items-center" key={id || item.name}>
              <div
                className="h-4 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <div className="ml-4 space-y-1">
                <p className="text-sm font-medium leading-none">{item.name ?? item.assistantId}</p>
              </div>
              <div className="ml-auto font-medium">{item.messages}</div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
