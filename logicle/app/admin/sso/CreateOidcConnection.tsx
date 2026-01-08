'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { InsertableOidcConnection, insertableOidcConnectionSchema } from '@/types/dto'

interface Props {
  onSubmit: (oidcconnection: InsertableOidcConnection) => void
}

const CreateOidcConnectionForm: FC<Props> = ({ onSubmit }) => {
  const { t } = useTranslation()

  const form = useForm<InsertableOidcConnection>({
    resolver: zodResolver(insertableOidcConnectionSchema),
    defaultValues: {
      name: '',
      description: '',
      discoveryUrl: '',
      clientId: '',
      clientSecret: '',
    },
  })

  const handleSubmit = (values: InsertableOidcConnection) => {
    onSubmit(values)
  }

  return (
    <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem label={t('connection-name')}>
            <Input placeholder={t('connection-name')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem label={t('connection-description')}>
            <Input placeholder={t('connection-description')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="discoveryUrl"
        render={({ field }) => (
          <FormItem label={t('discovery-url')}>
            <Input placeholder={t('discovery-url')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="clientId"
        render={({ field }) => (
          <FormItem label={t('client-id')}>
            <Input placeholder={t('client-id')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="clientSecret"
        render={({ field }) => (
          <FormItem label={t('client-secret')}>
            <PasswordInput placeholder={t('client-secret')} {...field} />
          </FormItem>
        )}
      />
      <Button type="submit">{t('create-connection')}</Button>
    </Form>
  )
}

const CreateOidcConnection = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()

  async function onSubmit(oidcconnection: InsertableOidcConnection) {
    const url = `/api/sso/oidc`
    const response = await post(url, oidcconnection)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate('api/sso')
    toast.success(t('sso-connection-successfully-created'))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[80%]">
        <DialogHeader>
          <DialogTitle>{t('create-oidc-connection')}</DialogTitle>
        </DialogHeader>
        <CreateOidcConnectionForm onSubmit={onSubmit}></CreateOidcConnectionForm>
      </DialogContent>
    </Dialog>
  )
}

export default CreateOidcConnection
