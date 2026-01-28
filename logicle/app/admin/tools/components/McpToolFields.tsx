'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { McpAuthentication } from './McpAuthentication'
import { McpPluginAuthentication, McpPluginParams } from '@/lib/tools/mcp/interface'
import { ToolFormWithConfig } from './toolFormTypes'

interface Props {
  form: UseFormReturn<ToolFormWithConfig<McpPluginParams>>
}

const McpToolFields = ({ form }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.url"
        render={({ field }) => (
          <FormItem label={t('url')}>
            <Input placeholder={t('mcp-sse-endpoint-placeholder')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.authentication"
        render={({ field }) => (
          <FormItem label={t('authentication')}>
            <McpAuthentication
              value={(field.value as McpPluginAuthentication | undefined) ?? { type: 'none' }}
              onValueChange={field.onChange}
            ></McpAuthentication>
          </FormItem>
        )}
      />
    </>
  )
}

export default McpToolFields
