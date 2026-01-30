'use client'
import { useTranslation } from 'react-i18next'
import { FC, useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useEnvironment } from '@/app/context/environmentProvider'
import { Textarea } from '@/components/ui/textarea'
import { insertableBackendSchema } from '@/types/dto/backend'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { USER_PROVIDED_API_KEY } from '@/lib/userSecrets/constants'

export type BackendFormFields = z.infer<typeof insertableBackendSchema>

interface Props {
  backend: BackendFormFields
  onSubmit: (backend: Partial<BackendFormFields>) => void
  creating?: boolean
}

interface ApiKeyFieldProps {
  backendApiKey?: string
  apiKeyValue?: string
  onApiKeyChange: (nextValue: string) => void
  field: {
    value?: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  }
}

const ApiKeyField = ({ backendApiKey, apiKeyValue, onApiKeyChange, field }: ApiKeyFieldProps) => {
  const { t } = useTranslation()
  const apiKeySource = apiKeyValue === USER_PROVIDED_API_KEY ? 'user' : 'server'
  const lastServerApiKey = useRef<string>(
    backendApiKey && backendApiKey !== USER_PROVIDED_API_KEY ? backendApiKey : ''
  )
  const apiKeySourceServerId = useId()
  const apiKeySourceUserId = useId()

  const handleApiKeySourceChange = (value: string) => {
    if (value === 'user') {
      onApiKeyChange(USER_PROVIDED_API_KEY)
      return
    }
    onApiKeyChange(lastServerApiKey.current ?? '')
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <RadioGroup
          value={apiKeySource}
          onValueChange={handleApiKeySourceChange}
          className="flex flex-col gap-3"
        >
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="server" id={apiKeySourceServerId} />
            <Label htmlFor={apiKeySourceServerId} className="flex flex-col">
              <span>{t('api_key_source_server')}</span>
              <span className="text-sm text-muted-foreground">
                {t('api_key_source_server_description')}
              </span>
            </Label>
          </div>
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="user" id={apiKeySourceUserId} />
            <Label htmlFor={apiKeySourceUserId} className="flex flex-col">
              <span>{t('api_key_source_user')}</span>
              <span className="text-sm text-muted-foreground">
                {t('api_key_source_user_description')}
              </span>
            </Label>
          </div>
        </RadioGroup>
      </div>
      {apiKeySource === 'server' && (
        <PasswordInput
          placeholder={t('api_key_placeholder')}
          value={field.value ?? ''}
          onChange={(event) => {
            const nextValue = event.target.value
            if (nextValue === USER_PROVIDED_API_KEY) {
              return
            }
            field.onChange(event)
          }}
        />
      )}
    </div>
  )
}

const BackendForm: FC<Props> = ({ backend, onSubmit, creating }) => {
  const { t } = useTranslation()

  const form = useForm<BackendFormFields>({
    resolver: zodResolver(insertableBackendSchema),
    defaultValues: {
      ...backend,
    },
  })
  const environment = useEnvironment()

  const providerType = backend.providerType
  const supportsApiKey =
    providerType === 'openai' ||
    providerType === 'anthropic' ||
    providerType === 'perplexity' ||
    providerType === 'gemini' ||
    providerType === 'logiclecloud'
  const handleSubmit = (values: BackendFormFields) => {
    const v = { ...values }
    for (const key of Object.keys(v)) {
      if (!form.formState.dirtyFields[key]) delete v[key]
    }
    onSubmit(v)
  }

  return (
    <Form {...form} onSubmit={(evt) => evt.preventDefault()} className="space-y-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem label={t('name')}>
            <Input placeholder={t('public_display_name')} {...field} />
          </FormItem>
        )}
      />
      {providerType === 'logiclecloud' && (
        <FormField
          control={form.control}
          name="endPoint"
          render={({ field }) => (
            <FormItem label={t('api-endpoint-label')}>
              <Input placeholder={t('api_endpoint_placeholder')} {...field} />
            </FormItem>
          )}
        />
      )}
      {supportsApiKey && (
        <FormField
          control={form.control}
          name={'apiKey' as any}
          render={({ field }) => (
            <FormItem label={t('api_key')}>
              <ApiKeyField
                backendApiKey={'apiKey' in backend ? backend.apiKey : undefined}
                apiKeyValue={form.watch('apiKey' as any) as string | undefined}
                onApiKeyChange={(nextValue) => {
                  form.setValue('apiKey' as any, nextValue, { shouldDirty: true })
                }}
                field={field}
              />
            </FormItem>
          )}
        />
      )}
      {providerType === 'gcp-vertex' && (
        <FormField
          control={form.control}
          name="credentials"
          render={({ field }) => (
            <FormItem label={t('credentials')}>
              <Textarea
                rows={20}
                placeholder={t('insert_gcp_credentials_placeholder')}
                {...field}
              />
            </FormItem>
          )}
        />
      )}
      <Button
        disabled={environment.backendConfigLock}
        type="button"
        onClick={form.handleSubmit(handleSubmit)}
      >
        {creating ? t('create-backend') : t('save')}
      </Button>
    </Form>
  )
}
export default BackendForm
