import { useTranslation } from 'react-i18next'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dialog } from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { patch, post } from '@/lib/fetch'
import React, { useState } from 'react'
import { ConversationSharing } from '@/db/schema'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'

interface Params {
  onClose: () => void
}

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'Project name be at least 2 characters.',
  }),
})

export const CreateFolderDialog: React.FC<Params> = ({ onClose }) => {
  const { t } = useTranslation()

  type FormFields = z.infer<typeof formSchema>

  const form = useForm<FormFields>({
    resetOptions: {},
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  })

  async function handleSubmit(values: FormFields) {
    const url = `/api/user/folders`
    const response = await post(url, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    //await mutate(url)
    toast.success(t('folder_successfully_created'))
    form.reset()
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[48rem] flex flex-col">
        <DialogHeader className="font-bold">
          <DialogTitle>{t('create_folder')}</DialogTitle>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem label={t('name')}>
                <Input placeholder={t('name')} {...field} />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('create-folder')}</Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
