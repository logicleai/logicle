import { useUserProfile } from '@/components/providers/userProfileContext'
import { EditWithPreview } from '@/components/ui/EditWithPreview'
import { userPreferencesDefaults } from '@/types/dto'

interface Props {
  value: string
  onChange: (value: string) => void
  height?: number
}
export const MessageEdit = ({ value, onChange, height }: Props) => {
  const profile = useUserProfile()
  if (profile?.preferences.advancedMessageEditor ?? userPreferencesDefaults.advancedMessageEditor)
    return <EditWithPreview height={height} value={value} onChange={onChange} />
  else
    return (
      <textarea
        className="w-full resize-none whitespace-pre-wrap border-none bg-transparent prose"
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
        style={{
          padding: '0',
          margin: '0',
          overflow: 'hidden',
        }}
      />
    )
}
