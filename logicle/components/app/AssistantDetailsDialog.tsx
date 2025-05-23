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

const tabs = ['details', 'instructions', 'tools'] as const
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
      <DialogContent className="sm:max-w-[50em] h-[55vh] flex flex-col overflow-hidden">
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
          <ScrollArea className="overflow-hidden scroll-workaround flex-1 pr-4">
            <TabsContent value="details" className="whitespace-pre">
              <PropList>
                <Prop label={t('name')} wrap={true}>
                  {assistant.name}
                </Prop>
                <Prop label={t('description')} wrap={true}>
                  {assistant.description}
                </Prop>
                <Prop label={t('model')}>{assistant.model}</Prop>
                <Prop label={t('token-limit')}>{assistant.tokenLimit}</Prop>
                <Prop label={t('owner')}>{assistant.ownerName}</Prop>
                <Prop label={t('created-at')}>{assistant.createdAt}</Prop>
              </PropList>
            </TabsContent>
            <div className="p-2">
              <TabsContent value="instructions" className="whitespace-pre">
                {isEmptyPrompt ? (
                  <div className="italic">{t('empty-instructions')}</div>
                ) : (
                  <div className="whitespace-pre-wrap break-all">{data?.systemPrompt}</div>
                )}
              </TabsContent>
              <TabsContent value="tools" className="whitespace-pre">
                <div className="flex flex-col gap-2">
                  {assistant.tools.map((t) => {
                    return <div key={t.id}>{t.name}</div>
                  })}
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
