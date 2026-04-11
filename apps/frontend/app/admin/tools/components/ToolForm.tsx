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
  DirectImageGeneratorPluginParams,
  DirectImageGeneratorSchema,
  GoogleImageGeneratorPluginInterface,
  ImageGeneratorPluginInterface,
  ImageGeneratorSchema,
  OpenAiImageGeneratorPluginInterface,
  ReplicateImageGeneratorPluginParams,
  ReplicateImageGeneratorSchema,
  ReplicateImageGeneratorPluginInterface,
  TogetherImageGeneratorPluginInterface,
} from '@/lib/tools/schemas'
import { OpenApiInterface } from '@/lib/tools/schemas'
import { ToolType } from '@/lib/tools/tools'
import TagInput from '@/components/ui/taginput'
import { WebSearchInterface, WebSearchSchema } from '@/lib/tools/schemas'
import { McpInterface, mcpPluginSchema } from '@/lib/tools/schemas'
import { Textarea } from '@/components/ui/textarea'
import OpenApiToolFields, { OpenApiConfig } from './OpenApiToolFields'
import WebSearchToolFields from './WebSearchToolFields'
import McpToolFields from './McpToolFields'
import ImageGeneratorToolFields, {
  googleImageGeneratorModels,
  ImageGeneratorFormConfig,
  openAiImageGeneratorModels,
  togetherImageGeneratorModels,
} from './ImageGeneratorToolFields'
import ReplicateImageGeneratorToolFields, {
  ReplicateImageGeneratorFormConfig,
} from './ReplicateImageGeneratorToolFields'
import { ToolFormFields, ToolFormWithConfig } from './toolFormTypes'
import { WebSearchParams } from '@/lib/tools/schemas'
import { McpPluginParams } from '@/lib/tools/schemas'
import { useToolTagSuggestions } from '@/hooks/tags'
import { ToolKnowledgeSection } from './ToolKnowledgeSection'
import { DummyToolInterface } from '@/lib/tools/schemas'

interface Props {
  className?: string
  type: ToolType
  tool: dto.InsertableTool
  onSubmit: (tool: dto.UpdateableTool) => void
}

const configurationSchema = (type: ToolType, apiKeys: string[]) => {
  if (type === ImageGeneratorPluginInterface.toolName) {
    return ImageGeneratorSchema
  } else if (type === OpenAiImageGeneratorPluginInterface.toolName) {
    return DirectImageGeneratorSchema
  } else if (type === GoogleImageGeneratorPluginInterface.toolName) {
    return DirectImageGeneratorSchema
  } else if (type === TogetherImageGeneratorPluginInterface.toolName) {
    return DirectImageGeneratorSchema
  } else if (type === ReplicateImageGeneratorPluginInterface.toolName) {
    return ReplicateImageGeneratorSchema
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
    return z.record(z.string(), z.unknown())
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
    files: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), size: z.number() })),
  })

  const configFiles = Array.isArray(tool.configuration?.files)
    ? (tool.configuration.files as dto.AssistantFile[])
    : []

  const form = useForm<ToolFormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...tool, files: configFiles },
  })

  function arraysEqual(a: string[], b: string[]): boolean {
    if (a === b) return true // same reference
    if (a.length !== b.length) return false
    return a.every((val, i) => val === b[i])
  }

  const handleSubmit = (values: ToolFormFields) => {
    const { files, ...rest } = values
    const v: dto.UpdateableTool = { ...rest }
    for (const key of Object.keys(v)) {
      if (key === 'tags') {
        if (arraysEqual(values.tags, tool.tags)) {
          delete v.tags
        }
      } else if (!form.formState.dirtyFields[key]) delete v[key]
    }
    // For dummy tools, always persist files into configuration
    if (type === DummyToolInterface.toolName) {
      v.configuration = { ...(v.configuration ?? tool.configuration), files }
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
      {type === OpenAiImageGeneratorPluginInterface.toolName && (
        <ImageGeneratorToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<ImageGeneratorFormConfig>>}
          models={openAiImageGeneratorModels}
        />
      )}
      {type === GoogleImageGeneratorPluginInterface.toolName && (
        <ImageGeneratorToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<ImageGeneratorFormConfig>>}
          models={googleImageGeneratorModels}
        />
      )}
      {type === TogetherImageGeneratorPluginInterface.toolName && (
        <ImageGeneratorToolFields
          form={form as unknown as UseFormReturn<ToolFormWithConfig<ImageGeneratorFormConfig>>}
          models={togetherImageGeneratorModels}
        />
      )}
      {type === ReplicateImageGeneratorPluginInterface.toolName && (
        <ReplicateImageGeneratorToolFields
          form={
            form as unknown as UseFormReturn<ToolFormWithConfig<ReplicateImageGeneratorFormConfig>>
          }
        />
      )}
      {type === DummyToolInterface.toolName && (
        <FormItem label={t('knowledge')}>
          <ToolKnowledgeSection form={form} />
        </FormItem>
      )}
      <Button type="button" onClick={form.handleSubmit(handleSubmit)}>
        {t('submit')}
      </Button>
    </Form>
  )
}
export default ToolForm
