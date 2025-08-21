import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormItem, FormLabel } from '@/components/ui/form'
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContentScrollable,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBackendsModels } from '@/hooks/backends'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChangeEvent, MutableRefObject, useEffect, useRef, useState } from 'react'
import * as dto from '@/types/dto'
import ImageUpload from '@/components/ui/ImageUpload'
import { Switch } from '@/components/ui/switch'
import { Upload } from '@/components/app/upload'
import { post } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { IconAlertCircle, IconX } from '@tabler/icons-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEnvironment } from '@/app/context/environmentProvider'
import { Badge } from '@/components/ui/badge'
import { StringList } from '@/components/ui/stringlist'
import { IconUpload } from '@tabler/icons-react'
import { AddToolsDialog } from './AddToolsDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSWRJson } from '@/hooks/swr'
import { InstructionsEditor } from './InstructionsEditor'

const DEFAULT = '__DEFAULT__'
const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
})

const formSchema = z.object({
  name: z.string().min(2, { message: 'name must be at least 2 characters.' }),
  iconUri: z.string().nullable(),
  description: z.string().min(2, { message: 'Description must be at least 2 characters.' }),
  model: z.custom<string>(() => []),
  systemPrompt: z.string(),
  reasoning_effort: z.enum(['low', 'medium', 'high', DEFAULT]),
  tokenLimit: z.coerce.number().min(256),
  temperature: z.coerce.number().min(0).max(1),
  tools: z.string().array(),
  files: fileSchema.array(),
  tags: z.string().array(),
  prompts: z.string().array(),
})

type FormFields = z.infer<typeof formSchema>

interface Props {
  assistant: dto.AssistantDraft
  onSubmit: (assistant: dto.UpdateableAssistantDraft) => void
  onChange?: (assistant: dto.UpdateableAssistantDraft) => void
  onValidate?: (valid: boolean) => void
  fireSubmit: MutableRefObject<(() => void) | undefined>
}

type TabState = 'general' | 'instructions' | 'tools' | 'knowledge'

interface ToolsTabPanelProps {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const ToolsTabPanel = ({ form, visible, className }: ToolsTabPanelProps) => {
  const { t } = useTranslation()
  const [isAddToolsDialogVisible, setAddToolsDialogVisible] = useState(false)
  const { data: allTools } = useSWRJson<dto.AssistantTool[]>('/api/user/tools')
  const allCapabilities = allTools?.filter((t) => t.capability) || []
  const allNonCapabilities = allTools?.filter((t) => !t.capability) || []
  return (
    <>
      <ScrollArea className={`${className}`} style={{ display: visible ? undefined : 'none' }}>
        <div className="flex flex-col gap-3 mr-4">
          <FormField
            control={form.control}
            name="tools"
            render={({ field }) => (
              <>
                <Card style={{ display: allCapabilities.length != 0 ? undefined : 'none' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle>{t('capabilities')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                      {allCapabilities.map((capability) => {
                        return (
                          <div
                            key={capability.id}
                            className="flex flex-row items-center space-y-0 border p-3"
                          >
                            <div className="flex-1">
                              <div className="flex-1">{capability.name}</div>
                            </div>
                            <Switch
                              onCheckedChange={(value) => {
                                if (capability.visible) {
                                  form.setValue(
                                    'tools',
                                    withToolToggled(field.value, capability.id, value)
                                  )
                                }
                              }}
                              checked={field.value.includes(capability.id)}
                            ></Switch>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle>{t('tools')}</CardTitle>
                    <Button
                      type="button"
                      onClick={(evt) => {
                        setAddToolsDialogVisible(true)
                        evt.preventDefault()
                      }}
                    >
                      {t('add-tools')}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex"></div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                      {allNonCapabilities
                        .filter((t) => field.value.includes(t.id))
                        .map((p) => {
                          return (
                            <div
                              key={p.id}
                              className="flex flex-row items-center space-y-0 border p-3"
                            >
                              <div className="flex-1">
                                <div className="flex-1">{p.name}</div>
                              </div>
                              <Button
                                onClick={() => {
                                  if (p.visible) {
                                    form.setValue(
                                      'tools',
                                      withToolToggled(field.value, p.id, false)
                                    )
                                  }
                                }}
                                variant="ghost"
                              >
                                <IconX stroke="1"></IconX>
                              </Button>
                            </div>
                          )
                        })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          />
        </div>
      </ScrollArea>
      {isAddToolsDialogVisible && (
        <AddToolsDialog
          members={allNonCapabilities.filter((tool) => !form.getValues().tools.includes(tool.id))}
          onClose={() => setAddToolsDialogVisible(false)}
          onAddTools={(tools: dto.AssistantTool[]) => {
            const idsToEnable = tools.map((t) => t.id)
            const patched = [...form.getValues().tools, ...idsToEnable]
            form.setValue('tools', patched)
          }}
        />
      )}
    </>
  )
}

interface KnowledgeTabPanelProps {
  assistant: dto.AssistantDraft
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const KnowledgeTabPanel = ({
  form,
  assistant,
  visible,
  className,
}: KnowledgeTabPanelProps) => {
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  // Here we store the status of the uploads, which is... form status + progress
  // Form status (files field) is derived from this on change
  const uploadStatus = useRef<Upload[]>(
    assistant.files.map((f) => {
      return {
        fileId: f.id, // backend generated id
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type,
        progress: 1,
        done: true,
      }
    })
  )

  const onDeleteUpload = async (upload: Upload) => {
    uploadStatus.current = uploadStatus.current.filter((u) => u.fileId != upload.fileId)
    updateFormFiles()
  }

  const updateFormFiles = () => {
    form.setValue(
      'files',
      uploadStatus.current.map((u) => {
        return {
          id: u.fileId,
          name: u.fileName,
          type: u.fileType,
          size: u.fileSize,
        }
      })
    )
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => {
    setIsDragActive(false)
  }

  const handleDrop = async (evt: React.DragEvent) => {
    setIsDragActive(false)
    evt.preventDefault()
    const droppedFiles = evt.dataTransfer.files
    if (droppedFiles.length > 0) {
      for (const file of droppedFiles) {
        void processAndUploadFile(file, file.name)
      }
    }
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) {
      return
    }
    for (const file of Array.from(files)) {
      await processAndUploadFile(file, file.name)
    }
  }

  const downloadFile = (upload: Upload) => {
    const link = document.createElement('a')
    link.download = upload.fileName
    link.href = `/api/files/${upload.fileId}/content`
    link.style.display = 'none'
    link.click()
  }

  const processAndUploadFile = async (file: Blob, fileName: string) => {
    const insertRequest: dto.InsertableFile = {
      size: file.size,
      type: file.type,
      name: fileName,
    }
    const response = await post<dto.File>(`/api/files?assistantId=${assistant.id}`, insertRequest)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    const uploadEntry = response.data
    const id = uploadEntry.id
    uploadStatus.current = [
      {
        fileId: id,
        fileName: fileName,
        fileType: file.type,
        fileSize: file.size,
        progress: 0,
        done: false,
      },
      ...uploadStatus.current,
    ]
    updateFormFiles()
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/files/${id}/content`, true)
    xhr.upload.addEventListener('progress', (evt) => {
      const progress = 0.9 * (evt.loaded / file.size)
      uploadStatus.current = uploadStatus.current.map((u) => {
        return u.fileId == id ? { ...u, progress } : u
      })
      updateFormFiles()
    })
    xhr.onreadystatechange = () => {
      // TODO: handle errors!
      if (xhr.readyState == XMLHttpRequest.DONE) {
        uploadStatus.current = uploadStatus.current.map((u) => {
          return u.fileId == id ? { ...u, progress: 1, done: true } : u
        })
        updateFormFiles()
      }
    }
    xhr.responseType = 'json'
    xhr.send(file)
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      style={{ display: visible ? undefined : 'none' }}
    >
      <ScrollArea className="flex-1 min-w-0 min-h-0">
        <div className="flex flex-col gap-3 mr-4">
          <FormField
            control={form.control}
            name="files"
            render={() => (
              <FormItem>
                <div>
                  <FormLabel className="flex items-center gap-3 p-1"></FormLabel>
                  <div className="flex flex-row flex-wrap">
                    {uploadStatus.current.map((upload) => {
                      return (
                        <Upload
                          key={upload.fileId}
                          onDelete={() => onDeleteUpload(upload)}
                          file={upload}
                          className="w-[250px] mt-2 mx-2"
                          onDownload={() => downloadFile(upload)}
                        ></Upload>
                      )
                    })}
                  </div>
                  <Input
                    type="file"
                    className="sr-only"
                    multiple
                    ref={uploadFileRef}
                    onClick={(e) => {
                      e.currentTarget.value = '' // selecting the same file still triggers onChange
                    }}
                    onChange={handleFileUploadChange}
                  />
                </div>
              </FormItem>
            )}
          />
        </div>
      </ScrollArea>
      <div
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        className={`flex flex-col p-12 items-center gap-4 border-dashed border-4 ${
          isDragActive ? 'bg-blue-100' : 'bg-white'
        }`}
      >
        <IconUpload size={32} />
        <span>
          <Trans
            i18nKey="drop_files_here_or_browse_for_file_upload"
            components={[
              <Button
                variant="link"
                size="link"
                key="key"
                onClick={(evt) => {
                  if (uploadFileRef.current != null) {
                    uploadFileRef.current.click()
                    uploadFileRef.current.value = '' // reset the value to allow the user upload the very same file
                  }
                  evt.preventDefault()
                }}
              >
                {' '}
              </Button>,
            ]}
          />
        </span>
      </div>
    </div>
  )
}

export const AssistantForm = ({ assistant, onSubmit, onChange, onValidate, fireSubmit }: Props) => {
  const { t } = useTranslation()
  const { data: models } = useBackendsModels()
  const formRef = useRef<HTMLFormElement>(null)
  const [activeTab, setActiveTab] = useState<TabState>('general')
  const backendModels = models || []
  const environment = useEnvironment()
  const modelsWithNickname = backendModels
    .flatMap((backend) => {
      return backend.models.map((m) => {
        return {
          id: `${m.id}#${backend.backendId}`,
          name: backendModels.length == 1 ? m.name : `${m.name}@${backend.backendName}`,
          model: m.name,
          backendId: backend.backendId,
        }
      })
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const [tabErrors, setTabErrors] = useState({
    general: false,
    instructions: false,
    tools: false,
    knowledge: false,
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
              tokenLimit: true,
              temperature: true,
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
      knowledge: false,
    }
  }

  const formSchema = z.object({
    name: z.string().min(2, { message: 'name must be at least 2 characters.' }),
    iconUri: z.string().nullable(),
    description: z.string().min(2, { message: 'Description must be at least 2 characters.' }),
    model: z.custom<string>((val) => modelsWithNickname.find((f) => f.id === (val as string))),
    reasoning_effort: z.enum(['low', 'medium', 'high', DEFAULT]),
    systemPrompt: z.string(),
    tokenLimit: z.coerce.number().min(256),
    temperature: z.coerce.number().min(0).max(1),
    tools: z.any().array(),
    files: fileSchema.array(),
    tags: z.string().array(),
    prompts: z.string().array(),
  })

  type FormFields = z.infer<typeof formSchema>

  const initialValues = {
    ...assistant,
    reasoning_effort: assistant.reasoning_effort ?? DEFAULT,
    model: `${assistant.model}#${assistant.backendId}`,
    backendId: undefined,
  } as FormFields

  const resolver = zodResolver(formSchema)
  const form = useForm<FormFields>({
    resolver,
    defaultValues: initialValues,
  })

  const formValuesToAssistant = (values: FormFields): dto.UpdateableAssistantDraft => {
    return {
      ...values,
      model: values.model?.split('#')[0],
      backendId: values.model?.split('#')[1],
      reasoning_effort: values.reasoning_effort == DEFAULT ? null : values.reasoning_effort,
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

  const handleSubmit = (values: FormFields) => {
    onSubmit(
      formValuesToAssistant({
        ...initialValues,
        ...values,
      })
    )
  }

  const isReasoningModel = (modelId: string) => {
    return environment.models.find((m) => m.id == modelId)?.capabilities.reasoning == true
  }

  const isToolCallingModel = (modelId: string) => {
    return environment.models.find((m) => m.id == modelId)?.capabilities.function_calling == true
  }

  fireSubmit.current = form.handleSubmit(handleSubmit, () => setTabErrors(computeTabErrors()))

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
              {isToolCallingModel(form.getValues().model.split('#')[0]) && (
                <TabsTrigger value="tools">
                  {t('tools')} {tabErrors.tools && <IconAlertCircle color="red" />}
                </TabsTrigger>
              )}
              <TabsTrigger value="knowledge">
                {t('knowledge')} {tabErrors.knowledge && <IconAlertCircle color="red" />}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea
          className="flex-1 min-w-0"
          style={{ display: activeTab == 'general' ? undefined : 'none' }}
        >
          <div className="flex flex-col gap-3 pr-2">
            <FormField
              control={form.control}
              name="iconUri"
              render={({ field }) => (
                <FormItem className="flex flex-col items-center">
                  <ImageUpload value={field.value} onValueChange={field.onChange} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem label={t('name')}>
                  <Input placeholder={t('create_assistant_field_name_placeholder')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem label={t('description')}>
                  <Input placeholder={t('assistant-description-field-placeholder')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem label={t('tags')}>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-row flex-wrap gap-2 w-100">
                      {field.value.map((tag) => {
                        return (
                          <Badge key={tag} className="flex gap-1">
                            {tag}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                form.setValue(
                                  'tags',
                                  field.value.filter((s) => s != tag)
                                )
                              }}
                            >
                              {'x'}
                            </Button>
                          </Badge>
                        )
                      })}
                    </div>
                    <Input
                      placeholder={t('insert_a_tag_and_press_enter')}
                      onKeyDown={(e) => {
                        if (e.key == 'Enter') {
                          const element = e.target as HTMLInputElement
                          const value = element.value
                          if (value.trim().length != 0) {
                            form.setValue('tags', [...field.value, value])
                            element.value = ''
                          }
                          // If we don't invoke preventDefault() upstream components
                          // may do weird things (like submitting forms...)
                          e.preventDefault()
                        }
                      }}
                    ></Input>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem label={t('model')}>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('create_assistant_field_select_model_placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContentScrollable className="max-h-72">
                      {modelsWithNickname.map((model) => (
                        <SelectItem value={model.id} key={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContentScrollable>
                  </Select>
                </FormItem>
              )}
            />
            {isReasoningModel(form.getValues().model.split('#')[0]) && (
              <FormField
                control={form.control}
                name="reasoning_effort"
                render={({ field }) => (
                  <FormItem label={t('reasoning_effort')}>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? undefined}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('default_')} />
                      </SelectTrigger>
                      <SelectContentScrollable className="max-h-72">
                        <SelectItem value={DEFAULT}>{t('default_')}</SelectItem>
                        <SelectItem value="low">{t('low')}</SelectItem>
                        <SelectItem value="medium">{t('medium')}</SelectItem>
                        <SelectItem value="high">{t('high')}</SelectItem>
                      </SelectContentScrollable>
                    </Select>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="prompts"
              render={({ field }) => (
                <FormItem label={t('conversation_starters')}>
                  <StringList
                    value={field.value}
                    maxItems={8}
                    onChange={field.onChange}
                    addNewPlaceHolder={t('insert_a_conversation_starter_placeholder')}
                  ></StringList>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tokenLimit"
              render={({ field }) => (
                <FormItem label={t('token-limit')}>
                  <Input
                    type="number"
                    placeholder={t('create_assistant_field_token_limit_placeholder')}
                    {...field}
                  />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem label={t('temperature')}>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    placeholder={t('create_assistant_field_temperature_placeholder')}
                    {...field}
                  />
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>
        <FormField
          control={form.control}
          name="systemPrompt"
          render={({ field }) => (
            <FormItem
              className={`h-full  flex-col min-h-0 ${
                activeTab == 'instructions' ? 'flex' : 'hidden'
              }`}
            >
              <InstructionsEditor
                className="flex-1 min-h-0"
                placeholder={t('create_assistant_field_system_prompt_placeholder')}
                {...field}
              />
            </FormItem>
          )}
        />
        <ToolsTabPanel className="flex-1 min-w-0" form={form} visible={activeTab == 'tools'} />
        <KnowledgeTabPanel
          className="flex-1"
          form={form}
          assistant={assistant}
          visible={activeTab == 'knowledge'}
        />
      </form>
    </FormProvider>
  )
}
function withToolToggled(tools: string[], toolId: string, enabled: boolean): string[] {
  const patched = tools.slice().filter((t) => t != toolId)
  if (enabled) {
    patched.push(toolId)
  }
  return patched
}
