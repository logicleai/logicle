'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { createUserSecret } from '@/services/userSecrets'
import { USER_SECRET_TYPE } from '@/lib/userSecrets/constants'
import { useSWRConfig } from 'swr'
import { Input } from '@/components/ui/input'
import { IconAlertOctagon } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

interface Props {
  backendId: string
  assistantId: string
  backendName: string
}

interface DialogProps {
  backendId: string
  assistantId: string
  backendName: string
  onClose: () => void
}

const formSchema = z.object({
  label: z.string().trim().min(1, { message: 'secret_name_required' }),
  apiKey: z.string().trim().min(1, { message: 'api_key_required' }),
})

type FormFields = z.infer<typeof formSchema>

const AddCredentialsDialog = ({ backendId, assistantId, backendName, onClose }: DialogProps) => {
  const { t } = useTranslation()
  const { mutate } = useSWRConfig()

  const displayName = backendName
  const defaultLabel = t('credentials_for_backend_named', { name: displayName })

  const dialogTitle = t('add_credentials_for_backend_named', { name: displayName })

  const dialogDescription = t('credentials_dialog_description_named', { name: displayName })

  const form = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      label: '',
      apiKey: '',
    },
  })
  useEffect(() => {
    form.reset({
      label: defaultLabel,
      apiKey: '',
    })
  }, [defaultLabel, form])

  const handleSave = async (values: FormFields) => {
    const trimmedLabel = values.label.trim()
    const trimmed = values.apiKey.trim()
    const response = await createUserSecret({
      context: backendId,
      type: USER_SECRET_TYPE,
      label: trimmedLabel,
      value: trimmed,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    if (assistantId) {
      await mutate(`/api/user/assistants/${assistantId}`)
    }
    await mutate((key) => typeof key === 'string' && key.startsWith('/api/user/assistants'))
    await mutate('/api/user/secrets')
    toast.success(t('api_key_saved'))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form} onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem label={t('name')}>
                <Input {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="apiKey"
            render={({ field }) => (
              <FormItem label={t('api_key')}>
                <PasswordInput placeholder={t('api_key_placeholder')} {...field} />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                form.formState.isSubmitting ||
                form.formState.isValidating ||
                !form.formState.isValid
              }
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export const ChatApiKeyPanel = ({ backendId, assistantId, backendName }: Props) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const panelMessage = t('assistant_requires_api_key_click_named', { name: backendName })

  const openDialog = () => {
    setOpen(true)
  }

  return (
    <div className="pt-.5 px-4 flex">
      <button
        type="button"
        onClick={openDialog}
        className="self-center border rounded-md p-4 mx-auto w-full max-w-[48em] cursor-pointer hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-center"
      >
        <span className="inline-flex items-center gap-2 text-base font-medium">
          <IconAlertOctagon size={22} className="text-destructive" />
          <span>{panelMessage}</span>
        </span>
      </button>
      {open && (
        <AddCredentialsDialog
          backendId={backendId}
          assistantId={assistantId}
          backendName={backendName}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
