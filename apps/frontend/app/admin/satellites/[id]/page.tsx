'use client'
import { useTranslation } from 'react-i18next'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Prop, PropList } from '@/components/ui/proplist'
import { useAdminSatellite } from '@/hooks/satellites'
import { AdminPage } from '../../components/AdminPage'
import { SatelliteDialog } from '@/app/satellites/components/SatelliteDialog'

const SatelliteDetail = () => {
  const { t } = useTranslation()
  const params = useParams()
  const satelliteId = params.id as string
  const { data: satellite, isLoading, mutate } = useAdminSatellite(satelliteId)
  const [renamingSatellite, setRenamingSatellite] = useState(false)

  if (!isLoading && !satellite) {
    return <AdminPage title={t('satellite-not-found')}>{null}</AdminPage>
  }

  return (
    <AdminPage
      isLoading={isLoading}
      title={satellite?.name ?? ''}
      headerActions={
        <Button variant="secondary" onClick={() => setRenamingSatellite(true)}>
          {t('rename')}
        </Button>
      }
    >
      {satellite && (
        <Card className="p-4 max-w-xl">
          <h2 className="text-lg font-semibold mb-4">{t('satellite-details')}</h2>
          <PropList>
            <Prop label={t('name')}>{satellite.name}</Prop>
            <Prop label={t('id')}>
              <code className="bg-muted px-2 py-1 rounded text-xs">{satellite.id}</code>
            </Prop>
            <Prop label={t('created')}>{new Date(satellite.createdAt).toLocaleDateString()}</Prop>
          </PropList>
        </Card>
      )}
      {satellite && renamingSatellite && (
        <SatelliteDialog
          mode="rename"
          scope="admin"
          satellite={satellite}
          onClose={() => setRenamingSatellite(false)}
          onSaved={(updated) => mutate(updated, { revalidate: false })}
        />
      )}
    </AdminPage>
  )
}

export default SatelliteDetail
