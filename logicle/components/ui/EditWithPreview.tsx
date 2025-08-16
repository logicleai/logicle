import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from '@/app/chat/components/Markdown'

type TabId = 'edit' | 'preview'

interface Props {
  value: string
  onChange: (text: string) => void
  height?: number
}

export function EditWithPreview({ value, onChange, height }: Props) {
  const [tab, setTab] = useState<TabId>('edit')

  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'edit' ? (
        <textarea
          style={{ height }}
          className="w-full border p-3 rounded-md"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <ScrollArea style={{ height }} className="border p-3 rounded-md">
          <Markdown className="prose">{value}</Markdown>
        </ScrollArea>
      )}
    </div>
  )
}
