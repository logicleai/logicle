'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { Prop, PropList } from '../ui/proplist'

interface Props {
  assistant: dto.UserAssistant
  onClose: () => void
}

const tabs = ['details', 'instructions'] as const
type TabId = (typeof tabs)[number]

export const AssistantDetailsDialog = ({ assistant, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const { t } = useTranslation()
  const { data } = useSWRJson<{ systemPrompt: string }>(
    `/api/user/assistants/${assistant.id}/systemPrompt`
  )
  const isEmptyPrompt = data && data.systemPrompt.trim().length == 0
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[50em] h-[50vh] flex flex-col overflow-hidden">
        <DialogHeader className="border-b mb-2 pb-2">
          <DialogTitle>{assistant.name}</DialogTitle>
        </DialogHeader>
        <Tabs
          orientation="vertical"
          className="flex flex-horz flex-1 gap-3 h-0 justify-stretch"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabId)}
        >
          <TabsList direction="vertical" className="border-r">
            {tabs.map((tabId) => {
              return (
                <TabsTrigger key={tabId} value={tabId}>
                  {t(tabId)}
                </TabsTrigger>
              )
            })}
          </TabsList>
          <ScrollArea className="overflow-hidden h-100 flex-1 pr-4">
            <TabsContent value="details" className="whitespace-pre">
              <PropList>
                <Prop label={t('name')}>{assistant.name}</Prop>
                <Prop label={t('description')}>{assistant.description}</Prop>
                <Prop label={t('owner')}>{assistant.owner}</Prop>
                <Prop label={t('created-at')}>{assistant.createdAt}</Prop>
              </PropList>
            </TabsContent>
            <div className="p-2">
              <TabsContent value="instructions" className="whitespace-pre">
                {isEmptyPrompt ? (
                  <div className="italic">{t('empty-instructions')}</div>
                ) : (
                  <div>{data?.systemPrompt}</div>
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
