'use client'
import { useTranslation } from 'next-i18next'
import React, { FC } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { UpdateableToolDTO } from '@/types/db'
import { ChatGptRetrievalPluginInterface } from '@/lib/tools/chatgpt-retrieval-plugin/interface'

interface Props {
  type: string
  tool: UpdateableToolDTO
  onSubmit: (tool: Partial<UpdateableToolDTO>) => void
}

const configurationSchema = (type: string) => {
  if (type == ChatGptRetrievalPluginInterface.toolName) {
    return z.object({
      baseUrl: z.string().url(),
      apiKey: z.string(),
    })
  } else {
    // we need a z.any() to make the compiler happy,
    // as this will make configuration.xxx fields not checked.
    return z.any()
  }
}
const ToolForm: FC<Props> = ({ type, tool, onSubmit }) => {
  const { t } = useTranslation('common')

  const formSchema = z.object({
    name: z.string(),
    configuration: configurationSchema(type),
  })

  type ToolFormFields = z.infer<typeof formSchema>

  const form = useForm<ToolFormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...tool },
  })

  const handleSubmit = (values: ToolFormFields) => {
    const v = { ...values }
    for (const key of Object.keys(v)) {
      if (!form.formState.dirtyFields[key]) delete v[key]
    }
    onSubmit(v)
  }

  return (
    <Form {...form} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem label="Name">
            <Input placeholder={t('public_display_name')} {...field} />
          </FormItem>
        )}
      />
      {type == ChatGptRetrievalPluginInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.baseUrl"
            render={({ field }) => (
              <FormItem label="Base URL">
                <Input placeholder={t('base url')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="configuration.apiKey"
            render={({ field }) => (
              <FormItem label="Api Key">
                <Input placeholder={t('api key...')} {...field} />
              </FormItem>
            )}
          />
        </>
      )}
      <Button type="submit">Submit</Button>
    </Form>
  )
}
export default ToolForm
