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
  const [selectedTools, setSelectedTools] = useState<Map<string, Set<string>>>(new Map())
  const [savingFor, setSavingFor] = useState<string | null>(null)

  const toggleTool = (satelliteId: string, toolName: string) => {
    setSelectedTools((prev) => {
      const newMap = new Map(prev)
      const satelliteTools = newMap.get(satelliteId) || new Set()
      if (satelliteTools.has(toolName)) {
        satelliteTools.delete(toolName)
      } else {
        satelliteTools.add(toolName)
      }
      if (satelliteTools.size === 0) {
        newMap.delete(satelliteId)
      } else {
        newMap.set(satelliteId, satelliteTools)
      }
      return newMap
    })
  }

  const saveTools = async (satelliteId: string) => {
    const toolNames = selectedTools.get(satelliteId)
    if (!toolNames || toolNames.size === 0) return

    const satellite = satellites.find((s) => s.satelliteId === satelliteId)
    if (!satellite) return

    setSavingFor(satelliteId)
    try {
      const toolsToSave = Array.from(toolNames)
        .map((name) => satellite.tools.find((t) => t.name === name))
        .filter(Boolean) as typeof satellite.tools

      const response = await post(`/api/me/satellites/${satelliteId}/tools`, {
        tools: toolsToSave,
      })

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      toast.success(t('tools-saved'))
      onSaved(satelliteId)
      setSelectedTools((prev) => {
        const newMap = new Map(prev)
        newMap.delete(satelliteId)
        return newMap
      })
    } catch (err) {
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
              <h3 className="font-semibold mb-3">{satellite.satelliteName}</h3>

              <div className="space-y-2 mb-4">
                {satellite.tools.map((tool) => (
                  <label key={tool.name} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTools.get(satellite.satelliteId)?.has(tool.name) ?? false}
                      onChange={() => toggleTool(satellite.satelliteId, tool.name)}
                    />
                    <div>
                      <div className="text-sm font-medium">{tool.name}</div>
                      {tool.description && (
                        <div className="text-xs text-gray-500">{tool.description}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <Button
                onClick={() => saveTools(satellite.satelliteId)}
                disabled={
                  !selectedTools.get(satellite.satelliteId) ||
                  selectedTools.get(satellite.satelliteId)!.size === 0 ||
                  savingFor === satellite.satelliteId
                }
                size="small"
              >
                {savingFor === satellite.satelliteId ? t('saving') : t('save-tools')}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
