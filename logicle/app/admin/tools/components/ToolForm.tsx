'use client'
import { useTranslation } from 'next-i18next'
import React, { FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import { ChatGptRetrievalPluginInterface } from '@/lib/tools/chatgpt-retrieval-plugin/interface'
import { Textarea } from '@/components/ui/textarea'
import { extractApiKeysFromOpenApiSchema, mapErrors, validateSchema } from '@/lib/openapi'
import { Dall_ePluginInterface } from '@/lib/tools/dall-e/interface'
import { OpenApiInterface } from '@/lib/tools/openapi/interface'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { yaml } from '@codemirror/lang-yaml'
import { parseDocument } from 'yaml'

interface Props {
  type: string
  tool: dto.UpdateableToolDTO
  onSubmit: (tool: dto.UpdateableToolDTO) => void
}

const configurationSchema = (type: string, apiKeys: string[]) => {
  if (type == ChatGptRetrievalPluginInterface.toolName) {
    return z.object({
      baseUrl: z.string().url(),
      apiKey: z.string(),
    })
  } else if (type == Dall_ePluginInterface.toolName) {
    return z.object({
      apiKey: z.string(),
    })
  } else if (type == OpenApiInterface.toolName) {
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
    name: z.string().min(2, 'Name must be at least 2 characters'),
    configuration: configurationSchema(type, apiKeys),
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

  // Mock YAML linting function
  const yamlLinter = async (view: EditorView) => {
    const code = view.state.doc.toString()
    const diagnostics: Diagnostic[] = []

    try {
      const doc = parseDocument(code)
      for (const warn of doc.warnings) {
        diagnostics.push({
          from: warn.pos[0],
          to: warn.pos[1],
          severity: 'warning',
          message: warn.message,
        })
      }
      for (const error of doc.errors) {
        diagnostics.push({
          from: error.pos[0],
          to: error.pos[1],
          severity: 'error',
          message: error.message,
        })
      }
      const docObject = doc.toJSON()
      try {
        const apiKeys = await extractApiKeysFromOpenApiSchema(docObject)
        setApiKeys(apiKeys)
      } catch (e) {
        console.log('Failed extracting API Keys...')
        setApiKeys([])
      }
      const result = validateSchema(docObject)
      if (result.errors) {
        const mappedErrors = mapErrors(result.errors, doc)
        for (const mappedError of mappedErrors) {
          const range = mappedError.range ?? { from: 0, to: 0 }
          const error = mappedError.error
          diagnostics.push({
            from: range.from,
            to: range.to,
            severity: 'error',
            message: `${error.message}\n\nat: ${error.instancePath}\nerrorParams: ${JSON.stringify(
              error.params
            )}`,
          })
        }
      }
    } catch (e) {
      console.log(e)
    }
    return diagnostics
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
      {type == OpenApiInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.spec"
            render={({ field }) => (
              <FormItem label={t('openapi_spec')}>
                <CodeMirror
                  height="400px"
                  extensions={[
                    yaml(),
                    lintGutter(), // Gutter for errors
                    linter(yamlLinter, {
                      hideOn: () => {
                        return false
                      },
                    }), // Custom linter
                  ]}
                  {...field}
                />
              </FormItem>
            )}
          />
          {apiKeys.map((apiKey) => {
            return (
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
            )
          })}
        </>
      )}
      {type == Dall_ePluginInterface.toolName && (
        <FormField
          control={form.control}
          name="configuration.apiKey"
          render={({ field }) => (
            <FormItem label={t('apy_key')}>
              <Textarea rows={20} placeholder={t('insert_api_key')} {...field} />
            </FormItem>
          )}
        />
      )}
      <Button type="submit">Submit</Button>
    </Form>
  )
}
export default ToolForm
