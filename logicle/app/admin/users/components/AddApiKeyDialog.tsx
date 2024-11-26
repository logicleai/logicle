import { WorkspaceRole } from '@/types/workspace'
import { useTranslation } from 'next-i18next'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'
import * as z from 'zod'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'

interface Props {
  onClose: () => void
  userId: string
}

export const AddApiKeyDialog = ({ onClose, userId }: Props) => {
  const { t } = useTranslation('common')
  const url = `/api/users/${userId}/apiKeys`

  const formSchema = z.object({
    description: z.string().min(2, 'must be longer than 2'),
  })

  type FormFields = z.infer<typeof formSchema>

  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: '',
    },
  })

  async function handleSubmit(formValues: any) {
    const response = await post(`/api/users/${userId}/apiKeys`, formValues)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('members-added'))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('create-apikey')}</DialogTitle>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem label={t('description')}>
                <Input placeholder={t('apikey-description-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <Button type="submit">{t('create-apikey')}</Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
