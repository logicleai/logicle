import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormItem, FormLabel } from '@/components/ui/form'
import { FormProvider, useForm } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import * as dto from '@/types/dto'
import ImageUpload from '@/components/ui/ImageUpload'
import { Switch } from '@/components/ui/switch'
import { Upload } from '@/components/app/upload'
import { post } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { IconAlertCircle, IconPlus } from '@tabler/icons-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEnvironment } from '@/app/context/environmentProvider'
import { Badge } from '@/components/ui/badge'
import { StringList } from '@/components/ui/stringlist'

interface Props {
  assistant: dto.AssistantWithTools
  onSubmit: (assistant: Partial<dto.InsertableAssistant>) => void
  onChange?: (assistant: Partial<dto.InsertableAssistant>) => void
  onValidate?: (valid: boolean) => void
  fireSubmit: MutableRefObject<(() => void) | undefined>
}

type TabState = 'general' | 'instructions' | 'tools'

export const AssistantForm = ({ assistant, onSubmit, onChange, onValidate, fireSubmit }: Props) => {
  const { t } = useTranslation()
  const { data: models } = useBackendsModels()
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const environment = useEnvironment()
  const formRef = useRef<HTMLFormElement>(null)
  const [activeTab, setActiveTab] = useState<TabState>('general')
  const showKnowledge = false
  const backendModels = models || []
  const modelsWithNickname = backendModels.flatMap((backend) => {
    return backend.models.map((m) => {
      return {
        id: `${m.id}@${backend.backendId}`,
        name: backendModels.length == 1 ? m.name : `${m.name}@${backend.backendName}`,
        model: m.name,
        backendId: backend.backendId,
      }
    })
  })
  const [tabErrors, setTabErrors] = useState({
    general: false,
    instructions: false,
    tools: false,
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
    } catch (e) {
      return false // Errors present
    }
  }

  const computeTabErrors = () => {
    return {
      general: !validateTab('general'),
      instructions: !validateTab('instructions'),
      tools: !validateTab('tools'),
    }
  }

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
    model: z.custom<string>((val) => modelsWithNickname.find((f) => f.id === (val as string))),
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
    model: `${assistant.model}@${assistant.backendId}`,
    backendId: undefined,
  } as FormFields

  const resolver = zodResolver(formSchema)
  const form = useForm<FormFields>({
    resolver,
    defaultValues: initialValues,
  })

  const formValuesToAssistant = (values: FormFields): Partial<dto.InsertableAssistant> => {
    return {
      ...values,
      model: values.model?.split('@')[0],
      backendId: values.model?.split('@')[1],
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

  fireSubmit.current = () => {
    formRef?.current?.requestSubmit()
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

  const onDeleteUpload = async (upload: Upload) => {
    uploadStatus.current = uploadStatus.current.filter((u) => u.fileId != upload.fileId)
    updateFormFiles()
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const insertRequest: dto.InsertableFile = {
      size: file.size,
      type: file.type,
      name: file.name,
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
        fileName: file.name,
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
    xhr.onreadystatechange = function () {
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
    <FormProvider {...form}>
      <form
        ref={formRef}
        onSubmit={form.handleSubmit(handleSubmit, () => setTabErrors(computeTabErrors()))}
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
              {environment.enableTools && (
                <TabsTrigger value="tools">
                  {' '}
                  {t('tools')} {tabErrors.tools && <IconAlertCircle color="red" />}
                </TabsTrigger>
              )}
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
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                form.setValue(
                                  'tags',
                                  field.value.filter((s) => s != tag)
                                )
                              }}
                            >
                              x
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
                        <SelectItem value={model.id} key={model.name}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContentScrollable>
                  </Select>
                </FormItem>
              )}
            />
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
        <div className="flex-1" style={{ display: activeTab == 'instructions' ? 'block' : 'none' }}>
          <FormField
            control={form.control}
            name="systemPrompt"
            render={({ field }) => (
              <FormItem className="h-full flex flex-col">
                <Textarea
                  className="flex-1"
                  rows={3}
                  placeholder={t('create_assistant_field_system_prompt_placeholder')}
                  {...field}
                />
              </FormItem>
            )}
          />
        </div>
        <ScrollArea
          className="flex-1 min-w-0"
          style={{ display: activeTab == 'tools' ? undefined : 'none' }}
        >
          <div className="flex flex-col gap-3 mr-4">
            <FormField
              control={form.control}
              name="tools"
              render={({ field }) => (
                <>
                  <FormLabel>{t('active-tools')}</FormLabel>
                  {field.value.map((p) => {
                    return (
                      <div key={p.id} className="flex flex-row items-center space-y-0">
                        <div className="flex-1">{p.name}</div>
                        <Switch
                          onCheckedChange={(value) => {
                            form.setValue('tools', withEnablePatched(field.value, p.id, value))
                          }}
                          checked={p.enabled}
                        ></Switch>
                      </div>
                    )
                  })}
                </>
              )}
            />
            {showKnowledge && (
              <FormField
                control={form.control}
                name="files"
                render={() => (
                  <FormItem>
                    <div>
                      <FormLabel className="flex items-center gap-3">
                        <div>{t('knowledge')}</div>
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={(evt) => {
                            if (uploadFileRef.current != null) {
                              uploadFileRef.current.click()
                              uploadFileRef.current.value = '' // reset the value to allow the user upload the very same file
                            }
                            evt.preventDefault()
                          }}
                        >
                          <IconPlus size="18"></IconPlus>
                        </Button>
                      </FormLabel>
                      <div className="flex flex-row flex-wrap">
                        {uploadStatus.current.map((upload) => {
                          return (
                            <Upload
                              key={upload.fileId}
                              onDelete={() => onDeleteUpload(upload)}
                              file={upload}
                              className="w-[250px] mt-2 mx-2"
                            ></Upload>
                          )
                        })}
                      </div>
                      <Input
                        type="file"
                        className="sr-only"
                        ref={uploadFileRef}
                        onChange={handleFileUploadChange}
                      />
                    </div>
                  </FormItem>
                )}
              />
            )}
          </div>
        </ScrollArea>
      </form>
    </FormProvider>
  )
}
function withEnablePatched(tools: dto.AssistantTool[], id: string, enabled: boolean) {
  return tools.map((p) => {
    return {
      ...p,
      enabled: p.id == id ? enabled : p.enabled,
    }
  })
}
