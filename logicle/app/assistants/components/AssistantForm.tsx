import { useTranslation } from 'react-i18next'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackendsModels } from '@/hooks/backends'
import { zodResolver } from '@hookform/resolvers/zod'
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
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
import { ContextLengthIndicator } from '@/components/app/ContextLengthIndicator'

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
      tokenLimit: Number(values.tokenLimit),
      temperature: Number(values.temperature),
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
  const previousEstimateInputs = useRef<
    | Readonly<{
        structuralKey: string
      }>
    | undefined
  >(undefined)
  const latestEstimateRequestSeq = useRef(0)

  useEffect(() => {
    const currentModel = environment.models.find((m) => m.id === selectedModel?.modelId)
    if (!currentModel || !selectedModel?.backendId) {
      setAssistantContextLength(undefined)
      previousEstimateInputs.current = undefined
      return
    }

    const structuralKey = JSON.stringify({
      backendId: selectedModel.backendId,
      modelId: selectedModel.modelId,
      files: files.map((file) => file.id),
      tools,
    })
    const previousInputs = previousEstimateInputs.current
    const isNonStructuralEdit =
      previousInputs !== undefined && previousInputs.structuralKey === structuralKey
    previousEstimateInputs.current = {
      structuralKey,
    }
    const debounceMs = isNonStructuralEdit ? 600 : 0

    const debounce = setTimeout(() => {
      const requestSeq = latestEstimateRequestSeq.current + 1
      latestEstimateRequestSeq.current = requestSeq
      const draftAssistant: dto.AssistantDraft = {
        ...assistant,
        ...formValuesToAssistant(form.getValues()),
      }
      void estimateAssistantDraftTokens({
        assistant: draftAssistant,
        messages: [],
      }).then((result) => {
        if (!result.data || latestEstimateRequestSeq.current !== requestSeq) return
        setAssistantContextLength(result.data.estimate.assistant)
        setCachedAssistantContextLength(result.data.estimate.assistant)
      })
    }, debounceMs)

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
  const onKnowledgeHasWarnings = useCallback(
    (hasWarnings: boolean) => setTabErrors((prev) => ({ ...prev, knowledge: hasWarnings })),
    []
  )

  if (firePublish)
    firePublish.current = form.handleSubmit(handlePublish, () => setTabErrors(computeTabErrors()))

  return (
    <FormProvider {...form}>
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        className="space-y-6 h-full flex flex-col p-2 overflow-hidden min-h-0 "
      >
        <div className="relative flex justify-center">
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
          <ContextLengthIndicator
            current={shownAssistantContextLength ?? 0}
            limit={tokenLimit}
            details={[t('context_length_tooltip_assistant_form')]}
            className="absolute right-0 top-1/2 -translate-y-1/2"
          />
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
        <KnowledgeTabPanel
          className="flex-1"
          form={form}
          visible={activeTab === 'knowledge'}
          modelId={selectedModel?.modelId}
          onHasWarnings={onKnowledgeHasWarnings}
        />
        <AdvancedTabPanel
          className="flex-1 min-w-0"
          form={form}
          visible={activeTab === 'advanced'}
        />
      </form>
    </FormProvider>
  )
}
