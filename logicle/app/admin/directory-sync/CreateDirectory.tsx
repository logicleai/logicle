import { Loading } from '@/components/ui'
import type { Directory } from '@boxyhq/saml-jackson'
import useDirectory from '@/hooks/useDirectory'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { useSWRJson } from '@/hooks/swr'
import { post } from '@/lib/fetch'

const formSchema = z.object({
  name: z.string(),
  provider: z.string(),
})

interface Params {
  visible: boolean
  setVisible: (visible: boolean) => void
}
const CreateDirectory = ({ visible, setVisible }: Params) => {
  const { t } = useTranslation()
  const { data } = useSWRJson<Record<string, string>>('/api/idp')
  const { mutateDirectory } = useDirectory()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      provider: 'generic-scim-v2',
    },
  })

  const onSubmit = async (values) => {
    const response = await post<{ data: Directory }>(`/api/directory-sync`, values)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('directory-connection-created'))
    await mutateDirectory()
    setVisible(false)
  }

  if (!data) {
    return <Loading />
  }

  const providers = data

  return (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogHeader className="font-bold">{t('create-directory-connection')}</DialogHeader>
      <DialogContent>
        <Form {...form} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="mt-2 flex flex-col space-y-2">
            <p>{t('create-directory-message')}</p>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem label={t('directory-name')}>
                  <Input placeholder={t('directory-name-placeholder')} {...field} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem label={t('directory-sync-provider')}>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.keys(providers).map((key) => (
                          <SelectItem value={key} key={key}>
                            {providers[key]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <Button
            type="submit"
            color="primary"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
            size="default"
          >
            {t('create-directory')}
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateDirectory
