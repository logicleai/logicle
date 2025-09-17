import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { FormField, FormItem } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FormFields } from './AssistantFormField'

interface Props {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const AdvancedTabPanel = ({ form, visible, className }: Props) => {
  const { t } = useTranslation()
  return (
    <ScrollArea className={className} style={{ display: visible ? undefined : 'none' }}>
      <div className="flex flex-col gap-3 pr-2">
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
