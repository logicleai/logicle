'use client'
import { useParams, useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { patch } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { useSWRJson } from '@/hooks/swr'
import { AdminPage } from '../../components/AdminPage'
import { useEnvironment } from '@/app/context/environmentProvider'
import { IdentityProviderRaw } from '@/lib/auth/saml'

const formSchema = z.object({
  name: z.string(),
  description: z.string(),
  redirectUrl: z.string(),
  defaultRedirectUrl: z.string(),
})

type FormFields = z.infer<typeof formSchema>

interface Props {
  connection: FormFields
  onSubmit: (samlconnection: FormFields) => void
}

const SsoConnectionForm: FC<Props> = ({ connection, onSubmit }) => {
  const { t } = useTranslation()
  const environment = useEnvironment()
  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: connection.name,
      description: connection.description,
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
        name="name"
        render={({ field }) => (
          <FormItem label={t('name')}>
            <Input placeholder={t('')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem label={t('description')}>
            <Input placeholder={t('')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="redirectUrl"
        render={({ field }) => (
          <FormItem label={t('redirect-url')}>
            <Input placeholder={t('')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="defaultRedirectUrl"
        render={({ field }) => (
          <FormItem label={t('default-redirect-url')}>
            <Input placeholder="" {...field} />
          </FormItem>
        )}
      />
      <Button disabled={environment.ssoConfigLock} type="submit">
        {t('submit')}
      </Button>
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
  const { t } = useTranslation()
  const url = `/api/sso/${clientId}`
  const { isLoading, error, data: connection } = useSWRJson<IdentityProviderRaw>(url)
  const router = useRouter()

  async function onSubmit(values: FormFields) {
    const response = await patch(url, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate('/api/sso')
    await mutate(url)
    toast.success(t('sso-connection-successfully-updated'))
    router.push(`/admin/sso`)
  }
  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={`SSO Connection ${connection?.data.name}`}
    >
      {connection && (
        <SsoConnectionForm
          connection={{
            name: connection.data.name ?? '',
            description: connection.data.description ?? '',
            redirectUrl: collapseArray(connection.data.redirectUrl),
            defaultRedirectUrl: connection.data.defaultRedirectUrl,
          }}
          onSubmit={onSubmit}
        />
      )}
    </AdminPage>
  )
}

export default SsoConnection
