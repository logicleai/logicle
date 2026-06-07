'use client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import type { DiscoverableSatellite } from '@/hooks/useDiscoverSatelliteTools'

interface SatelliteToolsDiscoveryModalProps {
  isOpen: boolean
  satellites: DiscoverableSatellite[]
  onSaved: (satelliteId: string) => void
}

export function SatelliteToolsDiscoveryModal({
  isOpen,
  satellites,
  onSaved,
}: SatelliteToolsDiscoveryModalProps) {
  const { t } = useTranslation()
  const [savingFor, setSavingFor] = useState<string | null>(null)

  const addSatelliteAsTool = async (satelliteId: string) => {
    setSavingFor(satelliteId)
    try {
      const response = await post(`/api/me/satellites/${satelliteId}/tools`, {})

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      toast.success(t('tool-saved'))
      onSaved(satelliteId)
    } catch {
      toast.error(t('error-saving-tools'))
    } finally {
      setSavingFor(null)
    }
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('discover-satellite-tools')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {satellites.map((satellite) => (
            <div key={satellite.satelliteId} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{satellite.satelliteName}</h3>
                <Button
                  onClick={() => addSatelliteAsTool(satellite.satelliteId)}
                  disabled={savingFor === satellite.satelliteId}
                  size="small"
                >
                  {savingFor === satellite.satelliteId ? t('saving') : t('add-as-tool')}
                </Button>
              </div>

              {satellite.tools.length > 0 && (
                <ul className="space-y-1">
                  {satellite.tools.map((tool) => (
                    <li key={tool.name} className="text-sm text-gray-600">
                      <span className="font-medium">{tool.name}</span>
                      {tool.description && (
                        <span className="text-gray-400"> — {tool.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
