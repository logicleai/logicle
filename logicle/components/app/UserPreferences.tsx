'use client'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { put } from '@/lib/fetch'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { ReactNode, useEffect } from 'react'
import { Switch } from '../ui/switch'

interface FormRowProps {
  label: ReactNode
  children: ReactNode
}

export function FormRow({ label, children }: FormRowProps) {
  return (
    <FormItem>
      <div className="flex items-center justify-between">
        <FormLabel>{label}</FormLabel>
        {children}
      </div>
    </FormItem>
  )
}

export const UserPreferences = () => {
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
        name="language"
        render={({ field }) => (
          <FormRow label={t('language')}>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <SelectTrigger className="w-[80px]">
                <SelectValue placeholder={t('select_language')} />
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
          </FormRow>
        )}
      />
      <FormField
        name="conversationEditing"
        render={({ field }) => (
          <FormRow label={t('conversation_editing')}>
            <Switch
              onCheckedChange={(value) => {
                form.setValue('conversationEditing', value)
              }}
              checked={field.value}
            ></Switch>
          </FormRow>
        )}
      />
      <FormField
        name="showIconsInChatbar"
        render={({ field }) => (
          <FormRow label={t('show_icons_in_chatbar')}>
            <Switch
              onCheckedChange={(value) => {
                form.setValue('showIconsInChatbar', value)
              }}
              checked={field.value}
            ></Switch>
          </FormRow>
        )}
      />
    </Form>
  )
}
