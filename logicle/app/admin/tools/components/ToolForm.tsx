'use client'
import { useTranslation } from 'react-i18next'
import { FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import { extractApiKeysFromOpenApiSchema, mapErrors, validateSchema } from '@/lib/openapi'
import {
  ImageGeneratorModels,
  ImageGeneratorPluginInterface,
  ImageGeneratorSchema,
} from '@/lib/tools/imagegenerator/interface'
import { OpenApiInterface } from '@/lib/tools/openapi/interface'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { yaml } from '@codemirror/lang-yaml'
import { parseDocument } from 'yaml'
import { ToolType } from '@/lib/tools/tools'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import TagInput from '@/components/ui/taginput'
import { WebSearchInterface, WebSearchSchema } from '@/lib/tools/websearch/interface'
import { WebSearch } from '@/lib/tools/websearch/implementation'
import { McpInterface, mcpPluginSchema } from '@/lib/tools/mcp/interface'
import InputPassword from '@/components/ui/input_password'
import { McpAuthentication } from './McpAuthentication'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  className?: string
  type: ToolType
  tool: dto.InsertableTool
  onSubmit: (tool: dto.UpdateableTool) => void
}

const configurationSchema = (type: ToolType, apiKeys: string[]) => {
  if (type === ImageGeneratorPluginInterface.toolName) {
    return ImageGeneratorSchema
  } else if (type === WebSearchInterface.toolName) {
    return WebSearchSchema
  } else if (type === McpInterface.toolName) {
    return mcpPluginSchema
  } else if (type === OpenApiInterface.toolName) {
    const apiKeyProps = Object.fromEntries(apiKeys.map((apiKey) => [apiKey, z.string()]))
    return z.object({
      spec: z.string(),
      supportedFormats: z
        .preprocess((val) => {
          if (typeof val === 'string') {
            return val
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item !== '')
          }
          return val
        }, z.array(z.string()))
        .optional(),
      ...apiKeyProps,
    })
  } else {
    // we need a z.any() to make the compiler happy,
    // as this will make configuration.xxx fields not checked.
    return z.any()
  }
}

const ToolForm: FC<Props> = ({ className, type, tool, onSubmit }) => {
  const { t } = useTranslation()

  const [apiKeys, setApiKeys] = useState<string[]>([])

  const formSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().min(2, 'Description must be at least 2 characters'),
    tags: z.string().array(),
    promptFragment: z.string(),
    configuration: configurationSchema(type, apiKeys),
  })

  type ToolFormFields = z.infer<typeof formSchema>

  const form = useForm<ToolFormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...tool },
  })

  function arraysEqual(a: string[], b: string[]): boolean {
    if (a === b) return true // same reference
    if (a.length !== b.length) return false
    return a.every((val, i) => val === b[i])
  }

  const handleSubmit = (values: ToolFormFields) => {
    const v: dto.UpdateableTool = { ...values }
    for (const key of Object.keys(v)) {
      if (key === 'tags') {
        // special case for tags
        if (arraysEqual(values.tags, tool.tags)) {
          delete v.tags
        }
      } else if (!form.formState.dirtyFields[key]) delete v[key]
    }
    if (type === 'dall-e' && values.configuration.model === '') {
      values.configuration.model = null
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
      } catch {
        console.log(`Failed extracting API keys...`)
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
    <Form
      {...form}
      onSubmit={(evt) => evt.preventDefault()}
      className={`space-y-6 ${className ?? ''}`}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem label={t('create_tool_field_name_label')}>
            <Input placeholder={t('create_tool_field_name_placeholder')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem label={t('description')}>
            <Input placeholder={t('create_tool_field_description_placeholder')} {...field} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="tags"
        render={({ field }) => (
          <FormItem label={t('tags')}>
            <TagInput
              value={field.value ?? []}
              onChange={(nextValue) => form.setValue('tags', nextValue)}
              placeholder={t('insert_a_tag_and_press_enter')}
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="promptFragment"
        render={({ field }) => (
          <FormItem label={t('prompt_fragment')}>
            <Textarea placeholder={t('create_tool_field_promptfragment_placeholder')} {...field} />
          </FormItem>
        )}
      />
      {type === OpenApiInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.supportedFormats"
            render={({ field }) => (
              <FormItem label={t('supported_attachments_mimetypes')}>
                <Input placeholder={t('comma_separated_list_of_mime_types...')} {...field} />
              </FormItem>
            )}
          />
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
                    <InputPassword
                      modalTitle={t('api_key')}
                      placeholder={t('insert_apikey_placeholder')}
                      {...field}
                    />
                  </FormItem>
                )}
              />
            )
          })}
        </>
      )}

      {type === WebSearch.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.apiKey"
            render={({ field }) => (
              <FormItem label={t('api_key')}>
                <InputPassword
                  modalTitle={t('api_key')}
                  placeholder={t('insert_apikey_placeholder')}
                  {...field}
                />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="configuration.apiUrl"
            render={({ field }) => (
              <FormItem label={t('api_url')}>
                <Input
                  placeholder={t('insert_apiurl_or_leave_blank_for_default')}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(evt) => field.onChange(evt.currentTarget.value || null)}
                />
              </FormItem>
            )}
          />
        </>
      )}

      {type === McpInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.url"
            render={({ field }) => (
              <FormItem label={t('url')}>
                <Input placeholder={t('mcp-sse-endpoint-placeholder')} {...field} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="configuration.authentication"
            render={({ field }) => (
              <FormItem label={t('authentication')}>
                <McpAuthentication
                  value={field.value ?? { type: 'none' }}
                  onValueChange={field.onChange}
                ></McpAuthentication>
              </FormItem>
            )}
          />
        </>
      )}

      {type === ImageGeneratorPluginInterface.toolName && (
        <>
          <FormField
            control={form.control}
            name="configuration.model"
            render={({ field }) => (
              <FormItem label={t('model')}>
                <Select
                  onValueChange={(value) => field.onChange(value === '<null>' ? null : value)}
                  value={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('automatic')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key={''} value={'<null>'}>
                      {t('automatic')}
                    </SelectItem>
                    {ImageGeneratorModels.map((m) => {
                      return (
                        <SelectItem key={m} value={m}>
                          {t(m)}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="configuration.apiKey"
            render={({ field }) => (
              <FormItem label={t('api_key')}>
                <Input placeholder={t('insert_apikey_placeholder')} {...field} />
              </FormItem>
            )}
          />
        </>
      )}
      <Button type="button" onClick={form.handleSubmit(handleSubmit)}>
        {t('submit')}
      </Button>
    </Form>
  )
}
export default ToolForm
