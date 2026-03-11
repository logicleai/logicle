import { useTranslation } from 'react-i18next'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackendsModels } from '@/hooks/backends'
import { zodResolver } from '@hookform/resolvers/zod'
import { MutableRefObject, useEffect, useRef, useState } from 'react'
import * as dto from '@/types/dto'
import { IconAlertCircle } from '@tabler/icons-react'
import { useEnvironment } from '@/app/context/environmentProvider'
import { FormFields, formSchema } from './AssistantFormField'
import { ToolsTabPanel } from './ToolsTabPanel'
import { KnowledgeTabPanel } from './KnowledgeTabPanel'
import { GeneralTabPanel } from './GeneralTabPanel'
import { SystemPromptTabPanel } from './SystemPromptTabPanel'
import { AdvancedTabPanel } from './AdvancedTabPanel'
import { llmModelNoCapabilities } from '@/lib/chat/models'
import { useCachedContextLength } from '@/components/providers/localstoragechatstate'
import { estimateAssistantDraftTokens } from '@/services/tokens'

interface Props {
  assistant: dto.AssistantDraft
  onPublish: (assistant: dto.UpdateableAssistantDraft) => void
  onChange?: (assistant: dto.UpdateableAssistantDraft) => void
  onValidate?: (valid: boolean) => void
  firePublish?: MutableRefObject<(() => void) | undefined>
}

type TabState = 'general' | 'instructions' | 'tools' | 'knowledge' | 'advanced'

export const AssistantForm = ({
  assistant,
  onPublish,
  onChange,
  onValidate,
  firePublish,
}: Props) => {
  const { t } = useTranslation()
  const { data: models } = useBackendsModels()
  const backendModels = models || []
  const formRef = useRef<HTMLFormElement>(null)
  const [activeTab, setActiveTab] = useState<TabState>('general')
  const environment = useEnvironment()
  const [tabErrors, setTabErrors] = useState({
    general: false,
    instructions: false,
    tools: false,
    knowledge: false,
    advanced: false,
  })

  // Helper function to validate each tab individually
  const validateTab = (tab: TabState): boolean => {
    try {
      // Validate only relevant fields based on the tab
      const values = form.getValues()
      switch (tab) {
        case 'general':
          formSchema
            .pick({
              name: true,
              description: true,
              model: true,
              tags: true,
            })
            .parse(values)
          break
        case 'instructions':
          formSchema
            .pick({
              systemPrompt: true,
            })
            .parse(values)
          break
        case 'tools':
          formSchema
            .pick({
              tools: true,
              files: true,
            })
            .parse(values)
          break
        case 'advanced':
          formSchema
            .pick({
              tokenLimit: true,
              temperature: true,
            })
            .parse(values)
          break
      }
      return true // No errors
    } catch {
      return false // Errors present
    }
  }

  const computeTabErrors = () => {
    return {
      general: !validateTab('general'),
      instructions: !validateTab('instructions'),
      tools: !validateTab('tools'),
      advanced: !validateTab('advanced'),
      knowledge: false,
    }
  }

  const initialValues = {
    ...assistant,
    model: {
      modelId: assistant.model,
      backendId: assistant.backendId,
    },
  } as FormFields

  const resolver = zodResolver(formSchema)
  const form = useForm<FormFields>({
    resolver,
    defaultValues: initialValues,
  })

  const formValuesToAssistant = (values: FormFields): dto.UpdateableAssistantDraft => {
    return {
      ...values,
      model: values.model.modelId,
      backendId: values.model.backendId,
    }
  }

  useEffect(() => {
    const subscription = form.watch(() => {
      onChange?.(formValuesToAssistant(form.getValues()))
      const errors = computeTabErrors()
      onValidate?.(!errors.general && !errors.instructions && !errors.tools)
      setTabErrors(errors) // Update validation errors on tab change
    })
    return () => subscription.unsubscribe()
  }, [onChange, form, form.watch, models])

  useEffect(() => {
    const errors = computeTabErrors()
    onValidate?.(!errors.general && !errors.instructions && !errors.tools)
    setTabErrors(errors) // Update validation errors on tab change
  }, [models])

  const needFocus = useRef<HTMLElement | undefined>(undefined)
  useEffect(() => {
    if (needFocus.current) needFocus.current.focus()
  }, [needFocus.current])

  const handlePublish = (values: FormFields) => {
    onPublish(
      formValuesToAssistant({
        ...initialValues,
        ...values,
      })
    )
  }

  const selectedModel = useWatch({
    control: form.control,
    name: 'model',
  })
  const systemPrompt = useWatch({
    control: form.control,
    name: 'systemPrompt',
  })
  const files = useWatch({
    control: form.control,
    name: 'files',
  })
  const tools = useWatch({
    control: form.control,
    name: 'tools',
  })
  const tokenLimit = useWatch({
    control: form.control,
    name: 'tokenLimit',
  })

  const llmModelCaps =
    environment.models.find((m) => m.id === selectedModel?.modelId)?.capabilities ??
    llmModelNoCapabilities

  const model = environment.models.find((m) => m.id === selectedModel?.modelId)
  const [cachedAssistantContextLength, setCachedAssistantContextLength] = useCachedContextLength(
    `assistant-form/${assistant.id}`
  )
  const [assistantContextLength, setAssistantContextLength] = useState<number | undefined>(
    cachedAssistantContextLength
  )
  const shownAssistantContextLength = assistantContextLength ?? cachedAssistantContextLength

  useEffect(() => {
    const currentModel = environment.models.find((m) => m.id === selectedModel?.modelId)
    if (!currentModel || !selectedModel?.backendId) {
      setAssistantContextLength(undefined)
      return
    }

    const debounce = setTimeout(() => {
      const draftAssistant: dto.AssistantDraft = {
        ...assistant,
        ...formValuesToAssistant(form.getValues()),
      }
      void estimateAssistantDraftTokens({
        assistant: draftAssistant,
        messages: [],
      }).then((result) => {
        if (!result.data) return
        setAssistantContextLength(result.data.estimate.assistant)
        setCachedAssistantContextLength(result.data.estimate.assistant)
      })
    }, 300)

    return () => clearTimeout(debounce)
  }, [
    assistant,
    environment.models,
    files,
    form,
    selectedModel?.backendId,
    selectedModel?.modelId,
    setCachedAssistantContextLength,
    systemPrompt,
    tools,
  ])

  const showToolsTabs = llmModelCaps.function_calling
  const showKnowledgeTabs = llmModelCaps.knowledge ?? true

  if (firePublish)
    firePublish.current = form.handleSubmit(handlePublish, () => setTabErrors(computeTabErrors()))

  return (
    <FormProvider {...form}>
      <form
        ref={formRef}
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
              <TabsTrigger value="general">
                {t('general')} {tabErrors.general && <IconAlertCircle color="red" />}
              </TabsTrigger>
              <TabsTrigger value="instructions">
                {t('instructions')} {tabErrors.instructions && <IconAlertCircle color="red" />}
              </TabsTrigger>
              {showToolsTabs && (
                <TabsTrigger value="tools">
                  {t('tools')} {tabErrors.tools && <IconAlertCircle color="red" />}
                </TabsTrigger>
              )}
              {showKnowledgeTabs && (
                <TabsTrigger value="knowledge">
                  {t('knowledge')} {tabErrors.knowledge && <IconAlertCircle color="red" />}
                </TabsTrigger>
              )}
              <TabsTrigger value="advanced">
                {t('advanced')} {tabErrors.advanced && <IconAlertCircle color="red" />}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="text-body2 text-muted-foreground text-center">
          {t('context_length')}: {(shownAssistantContextLength ?? 0).toLocaleString()} /{' '}
          {tokenLimit.toLocaleString()} ({t('system-prompt')} + {t('knowledge')})
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
        <AdvancedTabPanel
          className="flex-1 min-w-0"
          form={form}
          visible={activeTab === 'advanced'}
        />
      </form>
    </FormProvider>
  )
}
