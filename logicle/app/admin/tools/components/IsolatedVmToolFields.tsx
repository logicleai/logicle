'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ToolFormWithConfig } from './toolFormTypes'
import { IsolatedVmParams } from '@/lib/tools/isolated-vm/interface'

interface Props {
  form: UseFormReturn<ToolFormWithConfig<IsolatedVmParams>>
}

const IsolatedVmToolFields = ({ form }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.timeoutMs"
        render={({ field }) => (
          <FormItem label={t('timeout_ms')}>
            <Input
              type="number"
              min={0}
              placeholder={t('timeout_ms_placeholder')}
              value={typeof field.value === 'number' ? field.value : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value
                field.onChange(nextValue === '' ? null : Number(nextValue))
              }}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.memoryLimitMb"
        render={({ field }) => (
          <FormItem label={t('memory_limit_mb')}>
            <Input
              type="number"
              min={0}
              placeholder={t('memory_limit_mb_placeholder')}
              value={typeof field.value === 'number' ? field.value : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value
                field.onChange(nextValue === '' ? null : Number(nextValue))
              }}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.maxOutputBytes"
        render={({ field }) => (
          <FormItem label={t('max_output_bytes')}>
            <Input
              type="number"
              min={0}
              placeholder={t('max_output_bytes_placeholder')}
              value={typeof field.value === 'number' ? field.value : ''}
              onChange={(evt) => {
                const nextValue = evt.currentTarget.value
                field.onChange(nextValue === '' ? null : Number(nextValue))
              }}
            />
          </FormItem>
        )}
      />
    </>
  )
}

export default IsolatedVmToolFields
