import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import { InputWithCopy } from '@/components/ui/inputwithcopy'
import { insertableUserApiKeySchema } from '@/types/dto'

interface Props {
  onClose: () => void
  userId: string
}

export const AddApiKeyDialog = ({ onClose, userId }: Props) => {
  const { t } = useTranslation()
  const url = `/api/users/${userId}/apiKeys`
  const [createdApiKey, setCreatedApiKey] = useState<dto.ApiKey | undefined>(undefined)

  const form = useForm<dto.InsertableUserApiKey>({
    resolver: zodResolver(insertableUserApiKeySchema),
    defaultValues: {
      description: '',
      expiresAt: null,
    },
  })

  async function handleSubmit(formValues: dto.InsertableUserApiKey) {
    const response = await post<dto.ApiKey>(`/api/users/${userId}/apiKeys`, formValues)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setCreatedApiKey(response.data)
    await mutate(url)
    toast.success(t('apikey-added'))
  }

  const doCreate = () => {
    form.handleSubmit(handleSubmit)()
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
            <InputWithCopy readOnly={true} value={`${createdApiKey.id}.${createdApiKey.key}`} />
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
              <Button type="button" variant="primary" onClick={doCreate}>
                {t('create')}
              </Button>{' '}
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
