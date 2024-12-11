'use client'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Form, FormField, FormItem } from '@/components/ui/form'

import { PasswordInput } from '@/components/ui/password-input'
import { put } from '@/lib/fetch'
import { AdminPage } from '@/app/admin/components/AdminPage'

const formSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(7, {
      message: 'password must be at least 7 characters.',
    }),
    confirmNewPassword: z.string().min(7, {
      message: 'password must be at least 7 characters.',
    }),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don't match",
    path: ['confirmNewPassword'],
  })

export const UpdatePasswordForm = () => {
  const { t } = useTranslation('common')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  })
  async function onSubmit(values: z.infer<typeof formSchema>) {
    const response = await put('/api/user/password', values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('password-successfully-updated'))
    form.reset()
  }

  return (
    <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormField
        control={form.control}
        name="currentPassword"
        render={({ field }) => (
          <FormItem label={t('current-password')}>
            <PasswordInput placeholder={t('current-password')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="newPassword"
        render={({ field }) => (
          <FormItem label={t('new-password')}>
            <PasswordInput placeholder={t('new-password')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="confirmNewPassword"
        render={({ field }) => (
          <FormItem label={t('confirm-new-password')}>
            <PasswordInput placeholder={t('confirm-new-password')} {...field} />
          </FormItem>
        )}
      />
      <Button type="submit" size="default">
        {t('change-password')}
      </Button>
    </Form>
  )
}

export const UpdatePasswordPage = () => {
  const { t } = useTranslation('common')
  return (
    <AdminPage title={t('update-password')}>
      <UpdatePasswordForm></UpdatePasswordForm>
    </AdminPage>
  )
}
