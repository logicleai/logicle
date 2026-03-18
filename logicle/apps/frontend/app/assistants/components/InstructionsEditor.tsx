import { useUserProfile } from '@/components/providers/userProfileContext'
import { Textarea } from '@/components/ui/textarea'
import AdvancedInstructionsEditor from './AdvancedInstructionsEditor'
import { userPreferencesDefaults } from '@/types/dto'

type Props = {
  className?: string
  onChange?: ((value: string) => void) | undefined
  value?: string
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
}

export const InstructionsEditor: React.FC<Props> = (props) => {
  const profile = useUserProfile()
  if (
    profile?.preferences.advancedSystemPromptEditor ??
    userPreferencesDefaults.advancedSystemPromptEditor
  ) {
    return <AdvancedInstructionsEditor {...props}></AdvancedInstructionsEditor>
  } else {
    return (
      <Textarea {...props} onChange={(evt) => props.onChange?.(evt.target.value ?? '')}></Textarea>
    )
  }
}
