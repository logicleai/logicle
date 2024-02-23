import { workspaceRoles } from '@/types/workspace'
import { type Workspace } from '@/types/db'
import { useTranslation } from 'next-i18next'
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

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { useUsers } from '@/hooks/users'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'

const formSchema = z.object({
  userId: z.string(),
  role: z.string(),
})

const AddMember = ({
  visible,
  setVisible,
  workspace,
}: {
  visible: boolean
  setVisible: (visible: boolean) => void
  workspace: Workspace
}) => {
  const { data: users } = useUsers()
  const { t } = useTranslation('common')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: '',
      role: 'MEMBER',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const url = `/api/workspaces/${workspace.slug}/members`
    const response = await post(url, values)
    mutate(url)

    if (response.error) {
      toast.error(response.error.message)
      return
    }

    toast.success(t('member-added'))
    setVisible(false)
    form.reset()
  }

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('add-new-member')}</DialogTitle>
          <DialogDescription>{t('add-member-message')}</DialogDescription>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex justify-between space-x-3">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem label="User">
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(users ?? []).map((user) => (
                          <SelectItem value={user.id} key={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem label="Role">
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {workspaceRoles.map((role) => (
                          <SelectItem value={role} key={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <Button type="submit">Add user</Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default AddMember
