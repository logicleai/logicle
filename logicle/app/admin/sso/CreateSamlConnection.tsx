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
import { Textarea } from '@/components/ui/textarea'
import { InsertableSamlConnection, insertableSamlConnectionSchema } from '@/types/dto'

interface Props {
  samlconnection: InsertableSamlConnection
  onSubmit: (samlconnection: InsertableSamlConnection) => void
}

const CreateSamlConnectionForm: FC<Props> = ({ samlconnection, onSubmit }) => {
  const { t } = useTranslation()

  const form = useForm<InsertableSamlConnection>({
    resolver: zodResolver(insertableSamlConnectionSchema),
    defaultValues: samlconnection,
  })

  const handleSubmit = (values: InsertableSamlConnection) => {
    onSubmit({
      ...samlconnection,
      ...values,
    })
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
        name="rawMetadata"
        render={({ field }) => (
          <FormItem label="XML">
            <Textarea
              rows={20}
              placeholder={t('Insert the XML describing the SAML provider')}
              {...field}
            />
          </FormItem>
        )}
      />
      <Button type="submit">{t('create-connection')}</Button>
    </Form>
  )
}

const CreateSamlConnection = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const newSamlConnection: InsertableSamlConnection = {
    name: '',
    description: '',
    rawMetadata: '',
  }

  async function onSubmit(samlconnection: InsertableSamlConnection) {
    const url = `/api/sso/saml`
    const response = await post(url, samlconnection)

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
          <DialogTitle>{t('create-saml-connection')}</DialogTitle>
        </DialogHeader>
        <CreateSamlConnectionForm
          samlconnection={newSamlConnection}
          onSubmit={onSubmit}
        ></CreateSamlConnectionForm>
      </DialogContent>
    </Dialog>
  )
}

export default CreateSamlConnection
