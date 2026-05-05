'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormDescription, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToolFormWithConfig } from './toolFormTypes'
import { AudioTranscriptionParams } from '@/lib/tools/schemas'
import { SecretEditor } from './SecretEditor'

interface Props {
  form: UseFormReturn<ToolFormWithConfig<AudioTranscriptionParams>>
}

const AudioTranscriptionToolFields = ({ form }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.apiKey"
        render={({ field }) => (
          <FormItem label={t('api_key')}>
            <SecretEditor
              placeholder={t('insert_apikey_placeholder')}
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
          <FormItem label={t('api_url')}>
            <Input
              placeholder={t('insert_apiurl_or_leave_blank_for_default')}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value || undefined)}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.defaultLanguage"
        render={({ field }) => (
          <FormItem label={t('language')}>
            <Input
              placeholder={t('audio_transcription_default_language_placeholder')}
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
          <FormItem label={t('audio_transcription_poll_interval_ms')}>
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
          <FormItem label={t('audio_transcription_timeout_ms')}>
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
        name="configuration.speakerLabels"
        render={({ field }) => (
          <FormItem
            label={t('audio_transcription_speaker_labels')}
            className="flex flex-row items-center space-y-0"
          >
            <Switch
              className="mt-0 ml-auto"
              checked={field.value ?? true}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.includeTimestamps"
        render={({ field }) => (
          <FormItem
            label={t('audio_transcription_include_timestamps')}
            className="flex flex-row items-center space-y-0"
          >
            <div className="flex w-full items-center gap-3">
              <FormDescription className="text-xs">
                {t('audio_transcription_include_timestamps_description')}
              </FormDescription>
              <Switch
                className="ml-auto"
                checked={field.value ?? true}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
            </div>
          </FormItem>
        )}
      />
    </>
  )
}

export default AudioTranscriptionToolFields
