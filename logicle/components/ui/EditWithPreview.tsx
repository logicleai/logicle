import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

type TabId = 'edit' | 'preview'

interface EditWithPreviewProps {
  value: string
  onChange: (next: string) => void
  height?: number
  preview: React.ReactNode // caller handles how preview is rendered
}

export function EditWithPreview({ value, onChange, height, preview }: EditWithPreviewProps) {
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
          {preview}
        </ScrollArea>
      )}
    </div>
  )
}
