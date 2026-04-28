'use client'

import { useEffect, useState } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ReplicateImageGeneratorPluginParams } from '@/lib/tools/schemas'
import { ToolFormWithConfig } from './toolFormTypes'
import { SecretEditor } from './SecretEditor'

export type ReplicateImageGeneratorFormConfig = Omit<ReplicateImageGeneratorPluginParams, 'model'> & {
  model: string | null
}

interface Props {
  form: UseFormReturn<ToolFormWithConfig<ReplicateImageGeneratorFormConfig>>
}

const ReplicateImageGeneratorToolFields = ({ form }: Props) => {
  const { t } = useTranslation()
  const [inputText, setInputText] = useState(() =>
    JSON.stringify(form.getValues('configuration.input') ?? {}, null, 2)
  )

  useEffect(() => {
    setInputText(JSON.stringify(form.getValues('configuration.input') ?? {}, null, 2))
  }, [form])

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.model"
        render={({ field }) => (
          <FormItem label={t('model')}>
            <Input
              placeholder={t('replicate_image_model_placeholder')}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value.trim()
                field.onChange(nextValue.length === 0 ? null : nextValue)
              }}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.input"
        render={({ field }) => (
          <FormItem label={t('replicate_image_input_label')}>
            <Textarea
              placeholder={t('replicate_image_input_placeholder')}
              value={inputText}
              onChange={(evt) => {
                const raw = evt.currentTarget.value.trim()
                setInputText(evt.currentTarget.value)
                if (raw.length === 0) {
                  field.onChange({})
                  return
                }
                try {
                  field.onChange(JSON.parse(raw))
                } catch {
                  // Keep raw text locally until the JSON is valid again.
                }
              }}
              rows={8}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.apiKey"
        render={({ field }) => (
          <FormItem label={t('api_key')}>
            <SecretEditor placeholder={t('insert_apikey_placeholder')} {...field} />
          </FormItem>
        )}
      />
    </>
  )
}

export default ReplicateImageGeneratorToolFields
