'use client'
import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { AppSettingsDefaults } from '@/types/settings'
import toast from 'react-hot-toast'
import { useEnvironment } from '@/app/context/environmentProvider'

interface Props {
  settings: Record<string, string>
}

const SettingsForm = ({ settings }: Props) => {
  const { t } = useTranslation('common')

  const environment = useEnvironment()
  const formChildren: JSX.Element[] = []
  const defaultValues = {}

  for (const propName in AppSettingsDefaults) {
    if (propName == 'enable_signup' && !environment.enableSignup) {
      continue
    }
    const defaultValue = settings[propName] ?? AppSettingsDefaults[propName] + ''
    switch (AppSettingsDefaults[propName].constructor) {
      case Boolean:
        defaultValues[propName] = defaultValue
        formChildren.push(
          <FormField
            key={propName}
            name={propName}
            render={({ field }) => (
              <FormItem label={t(propName)} className="flex flex-row items-center space-y-0">
                <Switch
                  className="mt-0 ml-auto"
                  {...field}
                  checked={field.value == 'true'}
                  onCheckedChange={(value) => {
                    field.onChange(value + '')
                    handleSubmit(field.name, value + '')
                  }}
                ></Switch>
              </FormItem>
            )}
          />
        )
        break
      case String:
        defaultValues[propName] = defaultValue
        formChildren.push(
          <FormField
            key={propName}
            name={propName}
            render={({ field }) => (
              <FormItem label={t(propName)}>
                <Input key={propName} {...field}></Input>
              </FormItem>
            )}
          />
        )
        break
    }
  }

  const form = useForm<Record<string, string>>({
    defaultValues,
  })

  const handleSubmit = async (name: string, value: string) => {
    const response = await patch('/api/settings', {
      [name]: value,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate('/api/settings')
    toast.success(t('settings-successfully-updated'))
    form.reset({ ...form.getValues() })
  }

  return (
    <Form {...form} className="space-y-6">
      {formChildren}
    </Form>
  )
}

export default SettingsForm
