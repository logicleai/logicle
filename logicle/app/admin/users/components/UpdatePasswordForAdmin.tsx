'use client'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Form, FormField, FormItem } from '@/components/ui/form'

import { PasswordInput } from '@/components/ui/password-input'
import { put } from '@/lib/fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import * as dto from '@/types/dto'
import { mutateUser } from '@/hooks/users'

const formSchema = z
  .object({
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

interface Params {
  user: dto.User
  onClose: () => void
}

export const UpdatePasswordForAdmin = ({ user, onClose }: Params) => {
  const { t } = useTranslation()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPassword: '',
      confirmNewPassword: '',
    },
  })
  async function onSubmit(values: z.infer<typeof formSchema>) {
    const response = await put(`/api/users/${user.id}/password`, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('password-successfully-updated'))
    mutateUser(user.id)
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('enter_password')}</DialogTitle>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
      </DialogContent>
    </Dialog>
  )
}
