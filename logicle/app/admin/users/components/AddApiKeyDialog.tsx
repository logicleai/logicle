import { useTranslation } from 'react-i18next'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'
import * as z from 'zod'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import { InputWithCopy } from '@/components/ui/inputwithcopy'

interface Props {
  onClose: () => void
  userId: string
}

export const AddApiKeyDialog = ({ onClose, userId }: Props) => {
  const { t } = useTranslation()
  const url = `/api/users/${userId}/apiKeys`
  const [createdApiKey, setCreatedApiKey] = useState<dto.ApiKey | undefined>(undefined)

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

  async function handleSubmit(formValues: FormFields) {
    const response = await post<dto.ApiKey>(`/api/users/${userId}/apiKeys`, formValues)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setCreatedApiKey(response.data)
    await mutate(url)
    toast.success(t('apikey-added'))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[48rem]">
        {createdApiKey ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('apikey-created')}</DialogTitle>
            </DialogHeader>
            <Alert variant="destructive">
              <AlertDescription>{t('apikey-wont-be-able-to-see-again')}</AlertDescription>
            </Alert>
            <InputWithCopy readOnly={true} value={createdApiKey.key} />
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
