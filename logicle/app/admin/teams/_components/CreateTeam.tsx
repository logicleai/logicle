import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/navigation'
import React from 'react'
import toast from 'react-hot-toast'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormField, FormItem } from '@/components/ui/form'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { post } from '@/lib/fetch'
import { Team } from '@/types/db'
import { mutate } from 'swr'

const formSchema = z.object({
  name: z.string().min(4, {
    message: 'team name must be at least 4 characters',
  }),
})

const CreateTeam = ({
  visible,
  setVisible,
}: {
  visible: boolean
  setVisible: (visible: boolean) => void
}) => {
  const { t } = useTranslation('common')
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const response = await post<Team>('/api/teams/', values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    form.reset()
    mutate('/api/teams')
    setVisible(false)
    toast.success(t('team-created'))
    router.push(`/admin/teams/${response.data.slug}/settings`)
  }

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('create-team')}</DialogTitle>
          <DialogDescription>{t('members-of-a-team')}</DialogDescription>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem label="Name">
                <Input placeholder={t('team-name-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateTeam
