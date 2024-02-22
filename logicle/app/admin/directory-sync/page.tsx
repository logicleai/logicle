'use client'
import CreateDirectory from './CreateDirectory'
import Directory from './Directory'
import { WithLoadingAndError } from '@/components/ui'
import useDirectory from '@/hooks/useDirectory'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AdminPageTitle } from '../components/AdminPageTitle'

const DirectorySync = () => {
  const [visible, setVisible] = useState(false)
  const { isLoading, isError, directories } = useDirectory()
  const { t } = useTranslation('common')

  const directory = directories && directories.length > 0 ? directories[0] : null

  return (
    <WithLoadingAndError isLoading={isLoading} error={isError}>
      <AdminPageTitle title="Directory Sync" />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm">{t('provision')}</p>
        {directory === null ? (
          <Button
            onClick={() => setVisible(!visible)}
            variant="outline"
            color="primary"
            size="default"
          >
            {t('configure')}
          </Button>
        ) : (
          <Button
            onClick={() => setVisible(!visible)}
            variant="outline"
            color="error"
            disabled
            size="default"
          >
            {t('remove')}
          </Button>
        )}
      </div>
      <Directory />
      <CreateDirectory visible={visible} setVisible={setVisible} />
    </WithLoadingAndError>
  )
}

export default DirectorySync
