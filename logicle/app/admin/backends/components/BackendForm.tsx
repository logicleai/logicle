'use client'
import { useTranslation } from 'react-i18next'
import { FC } from 'react'
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

export type BackendFormFields = z.infer<typeof insertableBackendSchema>

interface Props {
  backend: BackendFormFields
  onSubmit: (backend: Partial<BackendFormFields>) => void
  creating?: boolean
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
      {(providerType === 'openai' ||
        providerType === 'anthropic' ||
        providerType === 'perplexity' ||
        providerType === 'gemini' ||
        providerType === 'logiclecloud') && (
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem label={t('api_key')}>
              <PasswordInput placeholder={t('api_key_placeholder')} {...field} />
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
