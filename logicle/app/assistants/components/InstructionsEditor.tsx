import { useUserProfile } from '@/components/providers/userProfileContext'
import { Textarea } from '@/components/ui/textarea'
import AdvancedInstructionsEditor from './AdvancedInstructionsEditor'

type Props = {
  className?: string
  onChange?: ((value: string) => void) | undefined
  value?: string
  defaultValue?: string
  placeholder?: string
}

export const InstructionsEditor: React.FC<Props> = (props) => {
  const profile = useUserProfile()
  if (profile?.preferences.advancedSystemPromptEditor ?? true) {
    return <AdvancedInstructionsEditor {...props}></AdvancedInstructionsEditor>
  } else {
    return (
      <Textarea {...props} onChange={(evt) => props.onChange?.(evt.target.value ?? '')}></Textarea>
    )
  }
}
