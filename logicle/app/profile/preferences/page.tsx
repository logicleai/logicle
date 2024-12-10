'use client'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Metadata } from 'next'
import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { patch, put } from '@/lib/fetch'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

const Preferences = () => {
  const userProfile = useUserProfile()?.preferences ?? {}
  const { t } = useTranslation()
  const form = useForm<dto.UserPreferences>({
    defaultValues: userProfile,
  })

  useEffect(() => {
    const subscription = form.watch(async () => {
      const response = await put('/api/user/preferences', form.getValues())
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      await mutate('/api/user/profile')
    })
    return () => subscription.unsubscribe()
  }, [form])

  return (
    <Form {...form} className="space-y-6">
      <FormField
        key="language"
        name="language"
        render={({ field }) => (
          <FormItem label={t('language')}>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {['it', 'en'].map((key) => (
                    <SelectItem value={key} key={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    </Form>
  )
}

export default Preferences
