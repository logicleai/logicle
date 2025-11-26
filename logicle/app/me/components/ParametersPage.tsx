'use client'
import { AdminPage } from '@/app/admin/components/AdminPage'
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
import { useEnvironment } from '@/app/context/environmentProvider'
import { useUserProfile } from '@/components/providers/userProfileContext'

const formSchema = z.object({
  properties: z.record(z.string()),
})

export const ParametersPanel = ({ user }: { user: dto.UserProfile }) => {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const environment = useEnvironment()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      properties: user.properties,
    },
  })

  const modifyingSelf = session?.user.id === user.id

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
    }
    if (modifyingSelf) {
      await mutate(profilePath)
    }
    await mutate(adminUserPath)
  }

  return (
    <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className={`space-y-6`}>
      <FormField
        control={form.control}
        name="properties"
        render={({ field }) => (
          <>
            {environment.userProperties.map((prop) => {
              return (
                <FormItem key={prop.id} label={prop.name} title={prop.description}>
                  <Input
                    title={prop.description}
                    placeholder={t('your-email')}
                    {...field}
                    onChange={(evt) =>
                      field.onChange({ ...field.value, [prop.id]: evt.currentTarget.value })
                    }
                    value={field.value[prop.id]}
                  />
                </FormItem>
              )
            })}
          </>
        )}
      ></FormField>
      <Button type="submit">{t('save-changes')}</Button>
    </Form>
  )
}

export const ParametersPage = () => {
  const { t } = useTranslation()
  const user = useUserProfile()
  if (!user) return null
  return (
    <AdminPage title={t('parameters')}>
      {user && <ParametersPanel user={user}></ParametersPanel>}
    </AdminPage>
  )
}
