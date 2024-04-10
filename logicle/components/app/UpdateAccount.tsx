'use client'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { SelectableUserDTO, UpdateableUserDTO, UserRoleName } from '@/types/user'

import { Form, FormField, FormItem } from '@/components/ui/form'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ImageUpload from '../ui/ImageUpload'
import { AdminPage } from '@/app/admin/components/AdminPage'

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'Username must be at least 2 characters.',
  }),
  email: z.string().email(),
  image: z.string().nullable(),
  role: z.string(),
})

interface Props {
  user: SelectableUserDTO
}

const UpdateAccount = ({ user }: Props) => {
  const { t } = useTranslation('common')
  const { data: session } = useSession()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
    },
  })

  const modifyingSelf = session?.user.id == user.id

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const adminUserPath = `/api/users/${user.id}`
    const profilePath = `/api/user/profile`
    const path = modifyingSelf ? profilePath : adminUserPath
    const response = await patch<UpdateableUserDTO>(path, values)
    if (response.error) {
      toast.error(response.error.message)
    } else {
      toast.success(t('account-successfully-updated'))
    }
    // Invalidate our cached SWR profile to refresh UI
    if (modifyingSelf) {
      mutate(profilePath)
    }
    mutate(adminUserPath)
  }

  return (
    <AdminPage title={t('update-account')}>
      <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="image"
          render={({ field }) => (
            <FormItem label={t('profile-picture')}>
              <ImageUpload
                value={field.value}
                onValueChange={(value) => form.setValue('image', value)}
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem label={t('name')}>
              <Input placeholder={t('your-name')} {...field} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem label={t('email')}>
              <Input placeholder={t('your-email')} {...field} />
            </FormItem>
          )}
        />
        {!modifyingSelf && (
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
        )}

        <Button type="submit">{t('save-changes')}</Button>
      </Form>
    </AdminPage>
  )
}

export default UpdateAccount
