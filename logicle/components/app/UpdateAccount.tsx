'use client'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useSession } from 'next-auth/react'

import { Form, FormField, FormItem } from '@/components/ui/form'
import * as dto from '@/types/dto'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ImageUpload from '../ui/ImageUpload'
import { useUserProfile } from '../providers/userProfileContext'

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'Username must be at least 2 characters.',
  }),
  email: z.string().email(),
  image: z.string().nullable(),
  role: z.string(),
  ssoUser: z.boolean(),
  properties: z.record(z.string()),
})

type FormProps = z.infer<typeof formSchema>

interface Props {
  user: FormProps & { id: string } & { properties: Record<string, string> }
  className?: string | undefined
  onClose?: () => void
}

export const UpdateAccountForm = ({ user, className, onClose }: Props) => {
  const { t } = useTranslation()
  const userProfile = useUserProfile()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      ssoUser: user.ssoUser,
    },
  })

  const modifyingSelf = userProfile?.id === user.id

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const adminUserPath = `/api/users/${user.id}`
    const profilePath = `/api/user/profile`
    const path = modifyingSelf ? profilePath : adminUserPath

    const dirtyValues = { ...values }
    for (const key of Object.keys(dirtyValues)) {
      if (!form.formState.dirtyFields[key]) delete dirtyValues[key]
    }
    const response = await patch<dto.UpdateableUser>(path, dirtyValues)
    if (response.error) {
      toast.error(response.error.message)
    } else {
      toast.success(t('account-successfully-updated'))
      onClose?.()
    }
    // Invalidate our cached SWR profile to refresh UI
    if (modifyingSelf) {
      await mutate(profilePath)
    }
    await mutate(adminUserPath)
  }

  return (
    <Form
      {...form}
      onSubmit={form.handleSubmit(onSubmit)}
      className={`space-y-6 ${className ?? ''}`}
    >
      <FormField
        control={form.control}
        name="image"
        render={({ field }) => (
          <FormItem>
            <ImageUpload {...field} />
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
        <>
          <FormField
            control={form.control}
            name="ssoUser"
            render={({ field }) => (
              <FormItem label={t(`auth-methods`)}>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value === 'true')
                  }}
                  value={field.value ? 'true' : 'false'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select auth mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={'true'}>{t('sso_user')}</SelectItem>
                    <SelectItem value={'false'}>{t('any_available')}</SelectItem>
                  </SelectContent>
                </Select>
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
                    <SelectItem value={dto.UserRole.USER}>{t('user')}</SelectItem>
                    <SelectItem value={dto.UserRole.ADMIN}>{t('admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </>
      )}
      <Button type="submit">{t('save-changes')}</Button>
    </Form>
  )
}
