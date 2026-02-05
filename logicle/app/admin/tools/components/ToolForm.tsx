'use client'
import { useTranslation } from 'react-i18next'
import { FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm, UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import {
  ImageGeneratorPluginInterface,
  ImageGeneratorSchema,
} from '@/lib/tools/imagegenerator/interface'
import { OpenApiInterface } from '@/lib/tools/openapi/interface'
import { ToolType } from '@/lib/tools/tools'
import TagInput from '@/components/ui/taginput'
import { WebSearchInterface, WebSearchSchema } from '@/lib/tools/websearch/interface'
import { McpInterface, mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { Textarea } from '@/components/ui/textarea'
import OpenApiToolFields, { OpenApiConfig } from './OpenApiToolFields'
import WebSearchToolFields from './WebSearchToolFields'
import McpToolFields from './McpToolFields'
import ImageGeneratorToolFields from './ImageGeneratorToolFields'
import IsolatedVmToolFields from './IsolatedVmToolFields'
import { ToolFormFields, ToolFormWithConfig } from './toolFormTypes'
import { WebSearchParams } from '@/lib/tools/websearch/interface'
import { McpPluginParams } from '@/lib/tools/mcp/interface'
import { ImageGeneratorPluginParams } from '@/lib/tools/imagegenerator/interface'
import { useToolTagSuggestions } from '@/hooks/tags'
import {
  IsolatedVmInterface,
  IsolatedVmParams,
  IsolatedVmSchema,
} from '@/lib/tools/isolated-vm/interface'

type ImageGeneratorFormConfig = Omit<ImageGeneratorPluginParams, 'model'> & {
  model: string | null
}

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
  } else if (type === IsolatedVmInterface.toolName) {
    return IsolatedVmSchema
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
    return z.never()
  }
}

const ToolForm: FC<Props> = ({ className, type, tool, onSubmit }) => {
  const { t } = useTranslation()
  const { data: tagSuggestions } = useToolTagSuggestions()

  const [apiKeys, setApiKeys] = useState<string[]>([])

  const formSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().min(2, 'Description must be at least 2 characters'),
    tags: z.string().array(),
    promptFragment: z.string(),
    configuration: configurationSchema(type, apiKeys),
  })

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
    onSubmit(v)
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
              suggestions={tagSuggestions ?? []}
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
        <OpenApiToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<OpenApiConfig>>}
          apiKeys={apiKeys}
          setApiKeys={setApiKeys}
        />
      )}

      {type === WebSearchInterface.toolName && (
        <WebSearchToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<WebSearchParams>>}
        />
      )}

      {type === McpInterface.toolName && (
        <McpToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<McpPluginParams>>}
        />
      )}

      {type === ImageGeneratorPluginInterface.toolName && (
        <ImageGeneratorToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<ImageGeneratorFormConfig>>}
        />
      )}

      {type === IsolatedVmInterface.toolName && (
        <IsolatedVmToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<IsolatedVmParams>>}
        />
      )}
      <Button type="button" onClick={form.handleSubmit(handleSubmit)}>
        {t('submit')}
      </Button>
    </Form>
  )
}
export default ToolForm
