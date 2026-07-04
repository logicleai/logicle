import { useTranslation } from 'react-i18next'
import { NumberInput } from '@/components/ui/number-input'
import { FormField, FormItem } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FormFields } from './AssistantFormField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const AdvancedTabPanel = ({ form, visible, className }: Props) => {
  const { t } = useTranslation()
  const compression = form.watch('contextCompression')
  const compressionPreset = compression?.preset ?? 'none'

  return (
    <ScrollArea className={className} style={{ display: visible ? undefined : 'none' }}>
      <div className="flex flex-col gap-3 pr-2">
        <FormField
          control={form.control}
          name="tokenLimit"
          render={({ field }) => (
            <FormItem label={t('token-limit')}>
              <NumberInput
                mode="integer"
                placeholder={t('create-assistant-field-token-limit-placeholder')}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="temperature"
          render={({ field }) => (
            <FormItem label={t('temperature')}>
              <NumberInput
                mode="float"
                min={0}
                max={1}
                step={0.1}
                placeholder={t('create-assistant-field-temperature-placeholder')}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contextCompression"
          render={({ field }) => (
            <FormItem label={t('context-compression')} title={t('context-compression-help')}>
              <div className="flex flex-col gap-1.5">
                <Select
                  value={field.value?.preset ?? 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') {
                      field.onChange(null)
                    } else {
                      field.onChange({
                        preset: v,
                        triggerAtTokens: field.value?.triggerAtTokens,
                      })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('context-compression-off')}</SelectItem>
                    <SelectItem value="conservative">
                      {t('context-compression-conservative')}
                    </SelectItem>
                    <SelectItem value="aggressive">{t('context-compression-aggressive')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t(`context-compression-detail-${compressionPreset}`)}
                </p>
              </div>
            </FormItem>
          )}
        />
        {compression && (
          <FormField
            control={form.control}
            name="contextCompression"
            render={({ field }) => (
              <FormItem label={t('context-compression-trigger')} title={t('context-compression-trigger-help')}>
                <NumberInput
                  mode="integer"
                  placeholder={t('context-compression-trigger-placeholder')}
                  value={field.value?.triggerAtTokens ?? ''}
                  onChange={(v) => {
                    field.onChange({
                      preset: field.value?.preset ?? 'conservative',
                      triggerAtTokens: v === '' ? undefined : Number(v),
                    })
                  }}
                />
              </FormItem>
            )}
          />
        )}
      </div>
    </ScrollArea>
  )
}
