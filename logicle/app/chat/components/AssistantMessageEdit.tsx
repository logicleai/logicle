import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssistantMessageMarkdown } from './AssistantMessageMarkdown'
import { ScrollArea } from '@/components/ui/scroll-area'

const tabs = ['edit', 'preview'] as const
type TabId = (typeof tabs)[number]

interface Props {
  initialText: string
  onClose: () => void
  height?: number
}
export const AssistantMessageEdit = ({ onClose, initialText, height }: Props) => {
  const { t } = useTranslation()
  const [text, setText] = useState<string>(initialText)
  const [activeTab, setActiveTab] = useState<TabId>('edit')
  const handleSave = () => {}

  return (
    <>
      <div className="flex flex-horz justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
          <TabsList>
            {tabs.map((menu) => {
              return (
                <TabsTrigger role="tab" key={menu} value={menu}>
                  {t(menu)}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
        <div>
          <Button variant="primary" onClick={handleSave}>
            {t('save_and_submit')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
      {activeTab == 'edit' && (
        <textarea style={{ height }} onChange={(evt) => setText(evt.target.value)}>
          {text}
        </textarea>
      )}

      {activeTab == 'preview' && (
        <ScrollArea style={{ height }} className="border p-3">
          <AssistantMessageMarkdown className="prose">{text}</AssistantMessageMarkdown>
        </ScrollArea>
      )}
    </>
  )
}
