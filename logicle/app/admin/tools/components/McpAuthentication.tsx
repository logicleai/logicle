import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
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
              : value === 'oauth'
              ? ({
                  type: 'oauth',
                  clientId: '',
                  clientSecret: '',
                } satisfies McpPluginAuthentication)
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
          <SelectItem value={'oauth'}>{t('oauth')}</SelectItem>
        </SelectContent>
      </Select>
      {value.type === 'bearer' && (
        <div>
          <p>{t('token')}</p>
          <Input
            value={value.bearerToken}
            onChange={(evt) => onValueChange({ ...value, bearerToken: evt.currentTarget.value })}
          ></Input>
        </div>
      )}
      {value.type === 'oauth' && (
        <div className="flex flex-col gap-2">
          <div>
            <p>{t('client_id')}</p>
            <Input
              value={value.clientId}
              autoComplete="off"
              onChange={(evt) => onValueChange({ ...value, clientId: evt.currentTarget.value })}
            />
          </div>
          <div>
            <p>{t('client_secret')}</p>
            <PasswordInput
              value={value.clientSecret ?? ''}
              autoComplete="new-password"
              onChange={(evt) =>
                onValueChange({ ...value, clientSecret: evt.currentTarget.value })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
