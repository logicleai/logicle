'use client'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import * as dto from '@/types/dto'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { CopyButton } from '@/app/chat/components/ChatSharingDialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const formSchema = z.object({
  description: z.string().min(2, {
    message: 'Description must be at least 2 characters.',
  }),
  expiration: z.number().nullable(),
})

type FormFields = z.infer<typeof formSchema>

export const CreateApiKeyDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const [createdApiKey, setCreatedApiKey] = useState<dto.ApiKey | null>(null)
  const defaultValues: FormFields = {
    description: '',
    expiration: null,
  }

  const form = useForm<FormFields>({
    resetOptions: {},
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  async function handleSubmit(values: FormFields) {
    const url = `/api/user/apikeys`
    const insertableApiKey: dto.InsertableUserApiKey = {
      description: values.description,
      expiresAt:
        values.expiration == null
          ? null
          : new Date(Date.now() + Number(values.expiration) * MS_PER_DAY).toISOString(),
    }

    const response = await post<dto.ApiKey>(url, insertableApiKey)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    await mutate(url)
    setCreatedApiKey(response.data) // <-- switch UI into "show key" mode
    form.reset()
  }

  const doCreate = () => {
    form.handleSubmit(handleSubmit)()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[50%]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('create_new_api_key')}</DialogTitle>
        </DialogHeader>

        {createdApiKey ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('copy_now_your_api_key_you_wont_be_able_to_see_it_again')}
            </p>
            <div className="flex gap-2">
              <input
                disabled
                className="flex-1 px-3 py-2 font-mono text-sm break-all"
                value={`${createdApiKey.id}.${createdApiKey.key}`}
              ></input>
              <CopyButton textToCopy={`${createdApiKey.id}.${createdApiKey.key}`}>
                {t('copy')}
              </CopyButton>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('close')}
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem label={t('description')}>
                  <Input placeholder={t('description')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiration"
              render={({ field }) => (
                <FormItem label={t('expiration')}>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value === 'never' ? null : parseInt(value, 10))
                    }}
                    value={field.value ? `${field.value}` : 'never'}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="7">{t('x_days', { count: 7 })}</SelectItem>
                        <SelectItem value="30">{t('x_days', { count: 30 })}</SelectItem>
                        <SelectItem value="60">{t('x_days', { count: 60 })}</SelectItem>
                        <SelectItem value="90">{t('x_days', { count: 90 })}</SelectItem>
                        <SelectItem value="never">{t('never')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <Button type="button" variant="primary" onClick={doCreate}>
              {t('create')}
            </Button>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
