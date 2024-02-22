import { WithLoadingAndError } from '@/components/ui'
import useDirectory from '@/hooks/useDirectory'
import { useTranslation } from 'next-i18next'
import { Input } from '@/components/ui/input'

const Directory = () => {
  const { t } = useTranslation('common')
  const { isLoading, isError, directories } = useDirectory()

  if (directories && directories.length === 0) {
    return null
  }

  const directory = directories[0]

  return (
    <WithLoadingAndError isLoading={isLoading} error={isError}>
      <div className="flex flex-col justify-between space-y-2 border-t text-sm">
        <p className="mt-3 text-sm">{t('directory-sync-message')}</p>
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">{t('scim-url')}</span>
          </label>
          <Input
            type="text"
            className="input-bordered input w-full"
            defaultValue={directory.scim.endpoint}
          />
        </div>
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">{t('auth-token')}</span>
          </label>
          <Input
            type="text"
            className="input-bordered input w-full"
            defaultValue={directory.scim.secret}
          />
        </div>
      </div>
    </WithLoadingAndError>
  )
}

export default Directory
