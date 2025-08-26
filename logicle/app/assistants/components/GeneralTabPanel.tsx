import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormItem, FormLabel } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
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
import { Badge } from '@/components/ui/badge'
import { StringList } from '@/components/ui/stringlist'
import { DEFAULT, FormFields, formSchema } from './AssistantFormField'
import { useEnvironment } from '@/app/context/environmentProvider'

interface Props {
  backendModels: dto.BackendModels[]
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const GeneralTabPanel = ({ form, backendModels, visible, className }: Props) => {
  const { t } = useTranslation()

  const environment = useEnvironment()
  const isReasoningModel = (modelId: string) => {
    return environment.models.find((m) => m.id === modelId)?.capabilities.reasoning === true
  }

  const modelsWithNickname = backendModels
    .flatMap((backend) => {
      return backend.models.map((m) => {
        return {
          id: `${m.id}#${backend.backendId}`,
          name: backendModels.length === 1 ? m.name : `${m.name}@${backend.backendName}`,
          model: m.name,
          backendId: backend.backendId,
        }
      })
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <ScrollArea className={className} style={{ display: visible ? undefined : 'none' }}>
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
                          disabled={field.disabled}
                          onClick={() => {
                            form.setValue(
                              'tags',
                              field.value.filter((s) => s !== tag)
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
                  disabled={field.disabled}
                  placeholder={t('insert_a_tag_and_press_enter')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const element = e.target as HTMLInputElement
                      const value = element.value
                      if (value.trim().length !== 0) {
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
              <Select
                disabled={field.disabled}
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('create_assistant_field_select_model_placeholder')} />
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
                <Select
                  disabled={field.disabled}
                  onValueChange={field.onChange}
                  defaultValue={field.value ?? undefined}
                >
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
                maxItems={8}
                addNewPlaceHolder={t('insert_a_conversation_starter_placeholder')}
                {...field}
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
  )
}
