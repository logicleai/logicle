'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { InputPassword } from '@/components/ui/input_password'
import { ToolFormWithConfig } from './toolFormTypes'
import { WebSearchParams } from '@/lib/tools/websearch/interface'

interface Props {
  form: UseFormReturn<ToolFormWithConfig<WebSearchParams>>
}

const WebSearchToolFields = ({ form }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.apiKey"
        render={({ field }) => (
          <FormItem label={t('api_key')}>
            <InputPassword
              modalTitle={t('api_key')}
              placeholder={t('insert_apikey_placeholder')}
              onChange={(value) => field.onChange(value)}
              disabled={field.disabled}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.apiUrl"
        render={({ field }) => (
          <FormItem label={t('api_url')}>
            <Input
              placeholder={t('insert_apiurl_or_leave_blank_for_default')}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value || null)}
            />
          </FormItem>
        )}
      />
    </>
  )
}

export default WebSearchToolFields
