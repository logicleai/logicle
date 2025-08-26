'use client'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSWRJson } from '@/hooks/swr'
import { AssistantVersion } from '@/db/schema'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as dto from '@/types/dto'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect, useState } from 'react'
import { get } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { GeneralTabPanel } from '../../components/GeneralTabPanel'
import { SystemPromptTabPanel } from '../../components/SystemPromptTabPanel'
import { ToolsTabPanel } from '../../components/ToolsTabPanel'
import { KnowledgeTabPanel } from '../../components/KnowledgeTabPanel'
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form'
import { DEFAULT, FormFields, formSchema } from '../../components/AssistantFormField'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useBackendsModels } from '@/hooks/backends'
import { zodResolver } from '@hookform/resolvers/zod'

type TabState = 'general' | 'instructions' | 'tools' | 'knowledge'

const AssistantHistoryEntry = ({ assistantVersion }: { assistantVersion: dto.AssistantDraft }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabState>('general')
  const environment = useEnvironment()
  const { data: models } = useBackendsModels()
  const backendModels = models || []

  const isToolCallingModel = (modelId: string) => {
    return environment.models.find((m) => m.id === modelId)?.capabilities.function_calling === true
  }

  const initialValues = {
    ...assistantVersion,
    reasoning_effort: assistantVersion.reasoning_effort ?? DEFAULT,
    model: `${assistantVersion.model}#${assistantVersion.backendId}`,
    backendId: undefined,
  } as FormFields

  const resolver = zodResolver(formSchema)
  const form = useForm<FormFields>({
    resolver,
    values: initialValues,
    disabled: true,
  })

  return (
    <FormProvider {...form}>
      <div className="h-full overflow-hidden">
        <div
          onSubmit={(e) => e.preventDefault()}
          className="space-y-6 h-full flex flex-col p-2 overflow-hidden min-h-0 "
        >
          <div className="flex flex-row gap-1 self-center">
            <Tabs
              onValueChange={(value) => setActiveTab(value as TabState)}
              value={activeTab}
              className="space-y-4 h-full flex flex-col Tabs"
            >
              <TabsList>
                <TabsTrigger value="general">{t('general')}</TabsTrigger>
                <TabsTrigger value="instructions">{t('instructions')}</TabsTrigger>
                {isToolCallingModel(form.getValues().model.split('#')[0]) && (
                  <TabsTrigger value="tools">{t('tools')}</TabsTrigger>
                )}
                <TabsTrigger value="knowledge">{t('knowledge')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <GeneralTabPanel
            className="flex-1 min-w-0"
            form={form}
            backendModels={backendModels}
            visible={activeTab === 'general'}
          />
          <SystemPromptTabPanel
            className="flex-1 min-h-0"
            form={form}
            visible={activeTab === 'instructions'}
          ></SystemPromptTabPanel>
          <ToolsTabPanel className="flex-1 min-w-0" form={form} visible={activeTab === 'tools'} />
          <KnowledgeTabPanel className="flex-1" form={form} visible={activeTab === 'knowledge'} />
        </div>
      </div>
    </FormProvider>
  )
}

const AssistantHistory = () => {
  const { id } = useParams() as { id: string }
  const url = `/api/assistants/${id}/history`
  const { data } = useSWRJson<AssistantVersion[]>(url)
  const [assistantVersionId, setAssistantVersionId] = useState<string | undefined>()
  const [assistantVersion, setAssistantVersion] = useState<dto.AssistantDraft | undefined>()
  const assistantVersions = data ?? []
  useEffect(() => {
    const doLoad = async () => {
      if (assistantVersionId) {
        const assistantUrl = `/api/assistants/drafts/${assistantVersionId}`
        const response = await get<dto.AssistantDraft>(assistantUrl)
        if (response.error) {
          setAssistantVersion(undefined)
        } else {
          setAssistantVersion(response.data)
        }
      }
    }
    void doLoad()
  }, [assistantVersionId])

  return (
    <div className="flex h-full">
      <ScrollArea className="scroll-workaround h-full p-2 w-200">
        <ul>
          {assistantVersions.map((assistantVersion) => (
            <li
              key={assistantVersion.id ?? ''}
              className={`flex items-center py-1 gap-2 rounded hover:bg-gray-100 truncate`}
            >
              <Button
                variant="ghost"
                size="link"
                className="w-100 overflow-hidden p-2"
                onClick={() => setAssistantVersionId(assistantVersion.id)}
              >
                <span className="flex-1 first-letter:capitalize truncate">
                  {assistantVersion.updatedAt}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="flex-1">
        {assistantVersion && (
          <AssistantHistoryEntry assistantVersion={assistantVersion}></AssistantHistoryEntry>
        )}
      </div>
    </div>
  )
}

export default AssistantHistory
