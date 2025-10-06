import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { McpPluginAuthentication } from '@/lib/tools/mcp/interface'
import { useTranslation } from 'react-i18next'

type Params = {
  onValueChange: (value: McpPluginAuthentication) => void
  value: McpPluginAuthentication
}

export const McpAuthentication = ({ value, onValueChange }: Params) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <Select
        onValueChange={(value) =>
          onValueChange(
            value === 'none'
              ? { type: 'none' }
              : ({ type: 'bearer', bearerToken: '' } satisfies McpPluginAuthentication)
          )
        }
        value={value.type}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={'none'}>{t('not_authenticated')}</SelectItem>
          <SelectItem value={'bearer'}>{t('bearer_token')}</SelectItem>
        </SelectContent>
      </Select>
      {value.type == 'bearer' && (
        <div>
          <p>token</p>
          <Input
            value={value.bearerToken}
            onChange={(evt) => onValueChange({ ...value, bearerToken: evt.currentTarget.value })}
          ></Input>
        </div>
      )}
    </div>
  )
}
