'use client'
import { useTranslation } from 'next-i18next'
import React, { FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import { ChatGptRetrievalPluginInterface } from '@/lib/tools/chatgpt-retrieval-plugin/interface'
import { OpenApiPlugin } from '@/lib/tools/openapi/implementation'
import { Textarea } from '@/components/ui/textarea'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'

interface Props {
  type: string
  tool: dto.UpdateableToolDTO
  onSubmit: (tool: dto.UpdateableToolDTO) => void
}

const extractApiKeysFromOpenApiSchema = async (schemaText: string): Promise<string[]> => {
  console.log('Start schema analysis')
  const result = new Map<string, OpenAPIV3.SecuritySchemeObject>()
  const openApiSpecYaml = jsYAML.load(schemaText)
  const openAPISpec = (await OpenAPIParser.validate(openApiSpecYaml)) as OpenAPIV3.Document
  if (openAPISpec.components?.securitySchemes) {
    for (const component in openAPISpec.components.securitySchemes) {
      const key = component
      const value = openAPISpec.components.securitySchemes[key] as OpenAPIV3.SecuritySchemeObject
      if (value.type == 'apiKey') {
        result.set(key, value as OpenAPIV3.SecuritySchemeObject)
      }
    }
  }
  return Array.from(result.keys())
}
const configurationSchema = (type: string, apiKeys: string[]) => {
  if (type == ChatGptRetrievalPluginInterface.toolName) {
    return z.object({
      baseUrl: z.string().url(),
      apiKey: z.string(),
    })
  } else if (type == OpenApiPlugin.toolName) {
    const props = Object.fromEntries(apiKeys.map((apiKey) => [apiKey, z.string()]))
    return z.object({
      spec: z.string(),
      ...props,
    })
  } else {
    // we need a z.any() to make the compiler happy,
    // as this will make configuration.xxx fields not checked.
    return z.any()
  }
}

const ToolForm: FC<Props> = ({ type, tool, onSubmit }) => {
  const { t } = useTranslation('common')

  const [apiKeys, setApiKeys] = useState<string[]>([])

  const formSchema = z.object({
    name: z.string(),
    configuration: configurationSchema(type, apiKeys),
  })

  type ToolFormFields = z.infer<typeof formSchema>

  const form = useForm<ToolFormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...tool },
  })

  const updateSecurityFields = async () => {
    const configuration = form.getValues()['configuration']
    if (configuration && configuration.spec) {
      const apiKeys = await extractApiKeysFromOpenApiSchema(configuration.spec)
      console.log(`Got API Keys: ${JSON.stringify(apiKeys)}`)
      setApiKeys(apiKeys)
    } else {
      console.info('No openapi to monitor...')
    }
  }

  useEffect(() => {
    updateSecurityFields()
  }, [])

  useEffect(() => {
    form.watch(() => {
      updateSecurityFields()
    })
  }, [form])

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
          <FormItem label={t('create_tool_field_name_label')}>
            <Input placeholder={t('create_tool_field_name_placeholder')} {...field} />
          </FormItem>
        )}
      />
      {type == ChatGptRetrievalPluginInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.baseUrl"
            render={({ field }) => (
              <FormItem label={t('create_tool_field_baseurl_label')}>
                <Input placeholder={t('create_tool_field_baseurl_placeholder')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="configuration.apiKey"
            render={({ field }) => (
              <FormItem label={t('create_tool_field_apikey_label')}>
                <Input placeholder={t('create_tool_field_apikey_placeholder')} {...field} />
              </FormItem>
            )}
          />
        </>
      )}
      {type == OpenApiPlugin.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.spec"
            render={({ field }) => (
              <FormItem label={t('spec')}>
                <Textarea rows={20} placeholder={t('spec')} {...field} />
              </FormItem>
            )}
          />
          {apiKeys.map((apiKey) => {
            return (
              <>
                <FormField
                  key={`configuration.${apiKey}`}
                  control={form.control}
                  name={`configuration.${apiKey}`}
                  render={({ field }) => (
                    <FormItem label={apiKey}>
                      <Input placeholder={t('api_key_value')} {...field} />
                    </FormItem>
                  )}
                />
              </>
            )
          })}
        </>
      )}
      <Button type="submit">Submit</Button>
    </Form>
  )
}
export default ToolForm
