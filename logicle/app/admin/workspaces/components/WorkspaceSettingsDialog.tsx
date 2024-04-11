import * as dto from '@/types/dto'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { put } from '@/lib/fetch'
import { Dialog } from '@radix-ui/react-dialog'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import { mutate } from 'swr'

const formSchema = z.object({
  name: z.string(),
  slug: z.string(),
  domain: z.string().nullable(),
})

export const WorkspaceSettingsDialog = ({
  workspace,
  opened,
  onClose,
}: {
  workspace: dto.Workspace
  opened: boolean
  onClose: () => void
}) => {
  const router = useRouter()
  const { t } = useTranslation('common')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: workspace.name,
      slug: workspace.slug,
      domain: workspace.domain,
    },
  })

  const onSubmit = async (values) => {
    const response = await put<dto.Workspace>(`/api/workspaces/${workspace.id}`, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    mutate(`/api/workspaces/${workspace.id}`)
    toast.success(t('successfully-updated'))
    onClose()
  }

  return (
    <Dialog open={opened} onOpenChange={onClose}>
      <DialogContent title="Diocane" className="sm:max-w-[425px]">
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem label={t('workspace-name-label')}>
                <Input placeholder={t('workspace-name-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem label={t('workspace-slug-label')}>
                <Input placeholder={t('workspace-slug-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="domain"
            render={({ field }) => (
              <FormItem label={t('workspace-domain')}>
                <Input placeholder={t('workspace-domain')} {...field} value={field.value ?? ''} />
              </FormItem>
            )}
          />
          <Button type="submit">{t('Submit')}</Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
