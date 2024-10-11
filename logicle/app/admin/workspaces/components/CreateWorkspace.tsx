import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/navigation'
import React from 'react'
import toast from 'react-hot-toast'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormField, FormItem } from '@/components/ui/form'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { mutate } from 'swr'

const CreateWorkspace = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation('common')
  const router = useRouter()

  const formSchema = z.object({
    name: z.string().min(2, {
      message: t('workspace_name_min_2_chars'),
    }),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const response = await post<dto.Workspace>('/api/workspaces/', values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    form.reset()
    await mutate('/api/workspaces')
    onClose()
    toast.success(t('workspace-created'))
    router.push(`/admin/workspaces/${response.data.id}`)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('create-workspace')}</DialogTitle>
          <DialogDescription>{t('members-of-a-workspace')}</DialogDescription>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem label="Name">
                <Input placeholder={t('workspace-name-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <Button type="submit">{t('create-workspace')}</Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateWorkspace
