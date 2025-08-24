import { WithLoadingAndError } from '@/components/ui'
import useDirectory from '@/hooks/useDirectory'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { useId } from 'react'

const Directory = () => {
  const { t } = useTranslation()
  const { isLoading, isError, directories } = useDirectory()

  // generate unique ids
  const scimUrlId = useId()
  const authTokenId = useId()

  if (directories && directories.length === 0) {
    return null
  }

  const directory = directories[0]

  return (
    <WithLoadingAndError isLoading={isLoading} error={isError}>
      <div className="flex flex-col justify-between space-y-2 border-t text-sm">
        <p className="mt-3 text-sm">{t('directory-sync-message')}</p>

        <div className="form-control w-full">
          <label className="label" htmlFor={scimUrlId}>
            <span className="label-text">{t('scim-url')}</span>
          </label>
          <Input
            id={scimUrlId}
            type="text"
            className="input-bordered input w-full"
            defaultValue={directory.scim.endpoint}
          />
        </div>

        <div className="form-control w-full">
          <label className="label" htmlFor={authTokenId}>
            <span className="label-text">{t('auth-token')}</span>
          </label>
          <Input
            id={authTokenId}
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
