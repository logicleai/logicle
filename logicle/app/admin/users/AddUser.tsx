'use client'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import { useTranslation } from 'next-i18next'
import React from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { InsertableUserDTO, UserRoleName } from '@/types/user'

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
  role: z.nativeEnum(UserRoleName),
})

type FormFields = z.infer<typeof formSchema>

const AddUser = ({ setVisible }: { setVisible: (visible: boolean) => void }) => {
  const { t } = useTranslation('common')
  async function handleSubmit(values: FormFields) {
    const url = `/api/users`
    const response = await post(url, {
      ...values,
    } as InsertableUserDTO)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    toast.success(t('account-successfully-updated'))
    form.reset()
    setVisible(false)
  }
  const defaultValues: FormFields = {
    name: '',
    email: '',
    password: generateRandomString(12),
    role: UserRoleName.USER,
  }

  const form = useForm<FormFields>({
    resetOptions: {},
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
  })

  return (
    <Dialog open={true} onOpenChange={setVisible}>
      <DialogContent className="sm:max-w-[50%]">
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
            name="password"
            render={({ field }) => (
              <FormItem label={t('password')}>
                <PasswordInput placeholder={t('new-password')} {...field} />
              </FormItem>
            )}
          />
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
                    <SelectItem value={UserRoleName.USER}>{t('User')}</SelectItem>
                    <SelectItem value={UserRoleName.ADMIN}>{t('Admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVisible(false)}>
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
