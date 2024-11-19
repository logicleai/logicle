'use client'
import { useTranslation } from 'next-i18next'
import React, { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useEnvironment } from '@/app/context/environmentProvider'
import { Textarea } from '@/components/ui/textarea'

const formSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('openai'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('anthropic'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    endPoint: z.string().url(),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('gcp-vertex'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    credentials: z.string().min(2, { message: 'Credentials must be at least 2 characters.' }),
  }),
])

export type BackendFormFields = z.infer<typeof formSchema>

interface Props {
  backend: BackendFormFields
  onSubmit: (backend: Partial<BackendFormFields>) => void
  creating?: boolean
}

const BackendForm: FC<Props> = ({ backend, onSubmit, creating }) => {
  const { t } = useTranslation('common')

  const form = useForm<BackendFormFields>({
    resolver: zodResolver(formSchema),
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
    <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem label="Name">
            <Input placeholder={t('public_display_name')} {...field} />
          </FormItem>
        )}
      />
      {providerType == 'logiclecloud' && (
        <FormField
          control={form.control}
          name="endPoint"
          render={({ field }) => (
            <FormItem label="API Endpoint">
              <Input placeholder={t('api_endpoint_placeholder')} {...field} />
            </FormItem>
          )}
        />
      )}
      {(providerType == 'openai' ||
        providerType == 'anthropic' ||
        providerType == 'logiclecloud') && (
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem label="API Key">
              <PasswordInput placeholder={t('api_key_placeholder')} {...field} />
            </FormItem>
          )}
        />
      )}
      {providerType == 'gcp-vertex' && (
        <FormField
          control={form.control}
          name="credentials"
          render={({ field }) => (
            <FormItem label="credentials">
              <Textarea
                rows={20}
                placeholder={t('insert_gcp_credentials_placeholder')}
                {...field}
              />
            </FormItem>
          )}
        />
      )}
      <Button disabled={environment.backendConfigLock} type="submit">
        {creating ? t('create-backend') : t('save')}
      </Button>
    </Form>
  )
}
export default BackendForm
