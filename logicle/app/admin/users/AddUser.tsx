'use client'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import * as dto from '@/types/dto'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { generateRandomString } from '@/lib/codeblock'

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'Username must be at least 2 characters.',
  }),
  email: z.string().email(),
  password: z.string(),
  role: z.nativeEnum(dto.UserRole),
  ssoUser: z.boolean(),
})

type FormFields = z.infer<typeof formSchema>

const AddUser = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  async function handleSubmit(values: FormFields) {
    const url = `/api/users`
    const insertableUser: dto.InsertableUser = {
      ...values,
      image: null,
      preferences: '{}',
      properties: {},
      password: values.ssoUser ? null : values.password,
    }
    const response = await post(url, insertableUser)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('account-successfully-updated'))
    form.reset()
    onClose()
  }
  const defaultValues: FormFields = {
    name: '',
    email: '',
    password: generateRandomString(12),
    role: dto.UserRole.USER,
    ssoUser: false,
  }

  const form = useForm<FormFields>({
    resetOptions: {},
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
  })

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[50%]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('add-user')}</DialogTitle>
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
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem label={t('email')}>
                <Input placeholder={t('Email')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ssoUser"
            render={({ field }) => (
              <FormItem label={t('auth-methods')}>
                <Select
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value ? 'true' : 'false'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={'true'}>{t('sso_user')}</SelectItem>
                    <SelectItem value={'false'}>{t('any_available')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {!form.getValues('ssoUser') && (
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem label={t('password')}>
                  <PasswordInput placeholder={t('new-password')} {...field} />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem label={t('role')}>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={dto.UserRole.USER}>{t('user')}</SelectItem>
                    <SelectItem value={dto.UserRole.ADMIN}>{t('admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('create-account')}</Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default AddUser
