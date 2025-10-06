import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { McpPluginAuthorization } from '@/lib/tools/mcp/interface'
import { useTranslation } from 'react-i18next'

type Params = {
  onValueChange: (value: McpPluginAuthorization) => void
  value: McpPluginAuthorization
}

export const McpAuthorization = ({ value, onValueChange }: Params) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <Select
        onValueChange={(value) =>
          onValueChange(
            value === 'none'
              ? { type: 'none' }
              : ({ type: 'bearer', bearerToken: '' } satisfies McpPluginAuthorization)
          )
        }
        value={value.type}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('automatic')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={'none'}>{t('none')}</SelectItem>
          <SelectItem value={'bearer'}>{t('bearer')}</SelectItem>
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
