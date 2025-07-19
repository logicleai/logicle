'use client'
import CreateDirectory from './CreateDirectory'
import Directory from './Directory'
import useDirectory from '@/hooks/useDirectory'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AdminPage, ScrollableAdminPage } from '../components/AdminPage'

const DirectorySync = () => {
  const [visible, setVisible] = useState(false)
  const { isLoading, isError, directories } = useDirectory()
  const { t } = useTranslation()

  const directory = directories && directories.length > 0 ? directories[0] : null

  return (
    <ScrollableAdminPage title="Directory Sync" isLoading={isLoading} error={isError}>
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
    </ScrollableAdminPage>
  )
}

export default DirectorySync
