'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { patch } from '@/lib/fetch'
import { useTranslation } from 'next-i18next'
import React, { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { SAMLSSORecord } from '@foosoftsrl/saml-jackson'
import { useSWRJson } from '@/hooks/swr'

const formSchema = z.object({
  redirectUrl: z.string(),
  defaultRedirectUrl: z.string(),
})

type FormFields = z.infer<typeof formSchema>

interface Props {
  connection: FormFields
  onSubmit: (samlconnection: FormFields) => void
}

const SsoConnectionForm: FC<Props> = ({ connection, onSubmit }) => {
  const { t } = useTranslation('common')

  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      redirectUrl: connection.redirectUrl,
      defaultRedirectUrl: connection.defaultRedirectUrl,
    },
  })

  const handleSubmit = (values: FormFields) => {
    onSubmit({
      ...connection,
      ...values,
    })
  }

  return (
    <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FormField
        control={form.control}
        name="redirectUrl"
        render={({ field }) => (
          <FormItem label="Redirect Url">
            <Input placeholder={t('')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="defaultRedirectUrl"
        render={({ field }) => (
          <FormItem label="Default Redirect URL">
            <Input placeholder="" {...field} />
          </FormItem>
        )}
      />
      <Button type="submit">Submit</Button>
    </Form>
  )
}

const collapseArray = (value: string | string[]): string => {
  if (value instanceof String) {
    return value as string
  } else {
    return value[0]
  }
}
const SsoConnection = () => {
  const { clientId } = useParams() as { clientId: string }
  const { t } = useTranslation('common')
  const url = `/api/sso/${clientId}`
  const { isLoading, error, data: connection } = useSWRJson<SAMLSSORecord>(url)
  const router = useRouter()

  async function onSubmit(values: FormFields) {
    const response = await patch(url, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate('/api/sso')
    mutate(url)
    toast.success(t('sso-connection-successfully-updated'))
    router.push(`/admin/sso`)
  }
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {connection && (
        <SsoConnectionForm
          connection={{
            redirectUrl: collapseArray(connection.redirectUrl),
            defaultRedirectUrl: connection.defaultRedirectUrl,
          }}
          onSubmit={onSubmit}
        />
      )}
    </WithLoadingAndError>
  )
}

export default SsoConnection
