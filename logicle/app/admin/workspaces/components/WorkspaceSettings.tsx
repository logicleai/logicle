import { Workspace } from '@/types/dto'
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

const formSchema = z.object({
  name: z.string(),
  slug: z.string(),
  domain: z.string().nullable(),
})

const WorkspaceSettings = ({ workspace }: { workspace: Workspace }) => {
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
    const response = await put<Workspace>(`/api/workspaces/${workspace.slug}`, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    toast.success(t('successfully-updated'))
    router.push(`/admin/workspaces/${response.data.slug}/settings`)
  }

  return (
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
  )
}

export default WorkspaceSettings
