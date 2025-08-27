import { useTranslation } from 'react-i18next'
import { FormField, FormItem } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
import { FormFields } from './AssistantFormField'
import { InstructionsEditor } from './InstructionsEditor'

interface Props {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const SystemPromptTabPanel = ({ form, className, visible }: Props) => {
  const { t } = useTranslation()
  return (
    <FormField
      control={form.control}
      name="systemPrompt"
      render={({ field }) => (
        <FormItem className={className} style={{ display: visible ? undefined : 'none' }}>
          <InstructionsEditor
            className="h-full"
            placeholder={t('create_assistant_field_system_prompt_placeholder')}
            {...field}
          />
        </FormItem>
      )}
    />
  )
}
