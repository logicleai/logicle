'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import { useTranslation } from 'next-i18next'
import React, { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SAMLSSORecord } from '@foosoftsrl/saml-jackson'
import { useSWRJson } from '@/hooks/swr'

export interface CreateSamlConnectionData {
  name: string
  description: string
  rawMetadata: string
}

interface Props {
  samlconnection: CreateSamlConnectionData
  onSubmit: (samlconnection: CreateSamlConnectionData) => void
}

const formSchema = z.object({
  name: z.string(),
  description: z.string(),
  rawMetadata: z.string().min(2, { message: 'This is a really short XML :)' }),
})

type FormFields = z.infer<typeof formSchema>

const CreateSamlConnectionForm: FC<Props> = ({ samlconnection, onSubmit }) => {
  const { t } = useTranslation('common')

  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: samlconnection,
  })

  const handleSubmit = (values: FormFields) => {
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
      <Button type="submit">Submit</Button>
    </Form>
  )
}

const CreateSamlConnection = ({
  visible,
  setVisible,
}: {
  visible: boolean
  setVisible: (visible: boolean) => void
}) => {
  const { mutate: mutateSamlConnections } = useSWRJson<SAMLSSORecord[]>('/api/sso')
  const { t } = useTranslation('common')
  const newSamlConnection: CreateSamlConnectionData = {
    name: '',
    description: '',
    rawMetadata: '',
  }

  async function onSubmit(samlconnection: CreateSamlConnectionData) {
    const url = `/api/saml`
    const response = await post(url, samlconnection)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutateSamlConnections()
    toast.success(t('sso-connection-successfully-created'))
    setVisible(false)
  }

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
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
