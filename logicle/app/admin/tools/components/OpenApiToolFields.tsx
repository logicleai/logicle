'use client'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Diagnostic, linter, lintGutter } from '@codemirror/lint'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { parseDocument } from 'yaml'
import { extractApiKeysFromOpenApiSchema, mapErrors, validateSchema } from '@/lib/openapi'
import { InputPassword } from '@/components/ui/input_password'
import { ToolFormWithConfig } from './toolFormTypes'

export type OpenApiConfig = {
  spec: string
  supportedFormats?: string[]
  [key: string]: unknown
}

interface Props {
  form: UseFormReturn<ToolFormWithConfig<OpenApiConfig>>
  apiKeys: string[]
  setApiKeys: (next: string[]) => void
}

const OpenApiToolFields = ({ form, apiKeys, setApiKeys }: Props) => {
  const { t } = useTranslation()

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
        const nextKeys = await extractApiKeysFromOpenApiSchema(docObject)
        setApiKeys(nextKeys)
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
    <>
      <FormField
        control={form.control}
        name="configuration.supportedFormats"
        render={({ field }) => (
          <FormItem label={t('supported_attachments_mimetypes')}>
            <Input
              placeholder={t('comma_separated_list_of_mime_types...')}
              value={Array.isArray(field.value) ? field.value.join(', ') : field.value ?? ''}
              onChange={(evt) => field.onChange(evt.currentTarget.value)}
            />
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
              value={(field.value ?? '') as string}
              onChange={(value) => field.onChange(value)}
              extensions={[
                yaml(),
                lintGutter(), // Gutter for errors
                linter(yamlLinter, {
                  hideOn: () => {
                    return false
                  },
                }), // Custom linter
              ]}
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
                  onChange={(value) => field.onChange(value)}
                  disabled={field.disabled}
                />
              </FormItem>
            )}
          />
        )
      })}
    </>
  )
}

export default OpenApiToolFields
