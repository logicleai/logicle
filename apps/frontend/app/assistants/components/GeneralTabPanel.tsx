import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { FormField, FormItem } from '@/components/ui/form'
import { UseFormReturn, useWatch } from 'react-hook-form'
import {
  Select,
  SelectContentScrollable,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import * as dto from '@/types/dto'
import ImageUpload from '@/components/ui/ImageUpload'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StringList } from '@/components/ui/stringlist'
import TagInput from '@/components/ui/taginput'
import { FormFields } from './AssistantFormField'
import { useEnvironment } from '@/app/context/environmentProvider'
import ModelSelect, { Model } from './ModelSelect'
import { useAssistantTagSuggestions } from '@/hooks/tags'

export const NULL_VALUE = '__NULL__'

interface Props {
  backendModels: dto.BackendModels[]
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const GeneralTabPanel = ({ form, backendModels, visible, className }: Props) => {
  const { t } = useTranslation()
  const { data: tagSuggestions } = useAssistantTagSuggestions()

  const environment = useEnvironment()
  const selectedModelId = useWatch({ control: form.control, name: 'model' }).modelId
  const selectedReasoningEffort = useWatch({ control: form.control, name: 'reasoning_effort' })
  const selectedModel = environment.models.find((m) => m.id === selectedModelId)
  const supportedReasoningEfforts = selectedModel?.supportedReasoningEfforts ?? []

  useEffect(() => {
    if (selectedReasoningEffort && !supportedReasoningEfforts.includes(selectedReasoningEffort)) {
      form.setError('reasoning_effort', { message: t('reasoning-effort-not-supported') })
    } else {
      form.clearErrors('reasoning_effort')
    }
  }, [selectedModelId, selectedReasoningEffort])

  const availableModels: Model[] = backendModels
    .flatMap((backend) => {
      return backend.models.map((llmModel) => {
        return {
          backendId: backend.backendId,
          backendName: backend.backendName,
          llmModel: llmModel,
        }
      })
    })
    .sort((a, b) => a.llmModel.name.localeCompare(b.llmModel.name))

  const findModel = () => {
    const model = form.getValues().model
    const found =
      availableModels.find(
        (m) => m.llmModel.id === model.modelId && m.backendId === model.backendId
      ) ?? null
    return found
  }
  return (
    <ScrollArea className={className} style={{ display: visible ? undefined : 'none' }}>
      <div className="flex flex-col gap-3 pr-2">
        <FormField
          control={form.control}
          name="iconUri"
          render={({ field }) => (
            <FormItem className="flex flex-col items-center">
              <ImageUpload {...field} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem label={t('name')}>
              <Input placeholder={t('create-assistant-field-name-placeholder')} {...field} />
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
              <TagInput
                value={field.value ?? []}
                onChange={(nextValue) => form.setValue('tags', nextValue)}
                disabled={field.disabled}
                placeholder={t('insert-a-tag-and-press-enter')}
                suggestions={tagSuggestions ?? []}
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem label={t('model')}>
              <ModelSelect
                {...field}
                placeholder={
                  backendModels.length === 0
                    ? ''
                    : t('create-assistant-field-select-model-placeholder')
                }
                models={availableModels}
                onChange={(value) => {
                  form.setValue('model', {
                    modelId: value.llmModel.id,
                    backendId: value.backendId,
                  })
                }}
                value={findModel()}
              ></ModelSelect>
            </FormItem>
          )}
        />
        {(supportedReasoningEfforts.length > 0 || selectedReasoningEffort) && (
          <FormField
            control={form.control}
            name="reasoning_effort"
            render={({ field }) => (
              <FormItem label={t('reasoning-effort')}>
                <Select
                  {...field}
                  value={field.value ?? NULL_VALUE}
                  onValueChange={(value) => field.onChange(value === NULL_VALUE ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('default-option')}>
                      {field.value ? t(field.value) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContentScrollable className="max-h-72">
                    <SelectItem value={NULL_VALUE}>{t('default-option')}</SelectItem>
                    {supportedReasoningEfforts.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {t(effort)}
                      </SelectItem>
                    ))}
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
            <FormItem label={t('conversation-starters')}>
              <StringList
                maxItems={8}
                addNewPlaceHolder={t('insert-a-conversation-starter-placeholder')}
                {...field}
              ></StringList>
            </FormItem>
          )}
        />
      </div>
    </ScrollArea>
  )
}
