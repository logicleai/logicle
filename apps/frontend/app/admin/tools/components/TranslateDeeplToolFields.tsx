'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToolFormWithConfig } from './toolFormTypes'
import { TranslateDeeplParams } from '@/lib/tools/schemas'
import { SecretEditor } from './SecretEditor'

interface Props {
  form: UseFormReturn<ToolFormWithConfig<TranslateDeeplParams>>
}

const formalityValues = ['default', 'more', 'less', 'prefer_more', 'prefer_less'] as const

const TranslateDeeplToolFields = ({ form }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.apiKey"
        render={({ field }) => (
          <FormItem label={t('api-key')}>
            <SecretEditor
              placeholder={t('insert-apikey-placeholder')}
              onChange={(value) => field.onChange(value)}
              value={field.value ? (field.value as string) : null}
              disabled={field.disabled}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.apiUrl"
        render={({ field }) => (
          <FormItem label={t('api-url')}>
            <Input
              placeholder={t('translate-deepl-api-url-placeholder')}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value || undefined)}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.defaultTargetLang"
        render={({ field }) => (
          <FormItem label={t('translate-deepl-default-target-lang')}>
            <Input
              placeholder={t('translate-deepl-default-target-lang-placeholder')}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value || undefined)}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.formality"
        render={({ field }) => (
          <FormItem label={t('translate-deepl-formality')}>
            <Select
              value={typeof field.value === 'string' ? field.value : 'default'}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formalityValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.glossaryId"
        render={({ field }) => (
          <FormItem label={t('translate-deepl-glossary-id')}>
            <Input
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value || undefined)}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.pollIntervalMs"
        render={({ field }) => (
          <FormItem label={t('translate-deepl-poll-interval-ms')}>
            <Input
              type="number"
              value={typeof field.value === 'number' ? `${field.value}` : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value
                field.onChange(nextValue ? Number.parseInt(nextValue, 10) : undefined)
              }}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.timeoutMs"
        render={({ field }) => (
          <FormItem label={t('translate-deepl-timeout-ms')}>
            <Input
              type="number"
              value={typeof field.value === 'number' ? `${field.value}` : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value
                field.onChange(nextValue ? Number.parseInt(nextValue, 10) : undefined)
              }}
            />
          </FormItem>
        )}
      />
    </>
  )
}

export default TranslateDeeplToolFields
