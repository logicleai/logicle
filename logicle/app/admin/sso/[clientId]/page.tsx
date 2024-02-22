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

interface Props {
  connection: SAMLSSORecord
  onSubmit: (samlconnection: SAMLSSORecord) => void
}

const SamlConnectionForm: FC<Props> = ({ connection, onSubmit }) => {
  const { t } = useTranslation('common')

  const formSchema = z.object({
    redirectUrl: z.string(),
    defaultRedirectUrl: z.string(),
  })

  type FormFields = z.infer<typeof formSchema>

  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      redirectUrl: connection.redirectUrl[0],
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

const SamlConnection = () => {
  const { clientId } = useParams() as { clientId: string }
  const { t } = useTranslation('common')
  const { isLoading, error, data: connections } = useSWRJson<SAMLSSORecord[]>(`/api/saml`)
  const router = useRouter()

  async function onSubmit(samlconnection: SAMLSSORecord) {
    const url = `/api/saml`
    const response = await patch(url, samlconnection)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('sso-connection-successfully-updated'))
    router.push(`/admin/saml`)
  }

  const connection = connections?.find((c) => c.clientID == clientId)
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {connection && <SamlConnectionForm connection={connection} onSubmit={onSubmit} />}
    </WithLoadingAndError>
  )
}

export default SamlConnection
