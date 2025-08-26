import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
import { useState } from 'react'
import * as dto from '@/types/dto'
import { Switch } from '@/components/ui/switch'
import { IconX } from '@tabler/icons-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AddToolsDialog } from './AddToolsDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSWRJson } from '@/hooks/swr'
import { FormFields } from './AssistantFormField'

interface ToolsTabPanelProps {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const ToolsTabPanel = ({ form, visible, className }: ToolsTabPanelProps) => {
  const { t } = useTranslation()
  const [isAddToolsDialogVisible, setAddToolsDialogVisible] = useState(false)
  const { data: allTools } = useSWRJson<dto.AssistantTool[]>('/api/user/tools')
  const allCapabilities = allTools?.filter((t) => t.capability) || []
  const allNonCapabilities = allTools?.filter((t) => !t.capability) || []
  return (
    <>
      <ScrollArea className={`${className}`} style={{ display: visible ? undefined : 'none' }}>
        <div className="flex flex-col gap-3 mr-4">
          <FormField
            control={form.control}
            name="tools"
            render={({ field }) => (
              <>
                <Card style={{ display: allCapabilities.length !== 0 ? undefined : 'none' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle>{t('capabilities')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                      {allCapabilities.map((capability) => {
                        return (
                          <div
                            key={capability.id}
                            className="flex flex-row items-center space-y-0 border p-3"
                          >
                            <div className="flex-1">
                              <div className="flex-1">{capability.name}</div>
                            </div>
                            <Switch
                              onCheckedChange={(value) => {
                                if (capability.visible) {
                                  form.setValue(
                                    'tools',
                                    withToolToggled(field.value, capability.id, value)
                                  )
                                }
                              }}
                              checked={field.value.includes(capability.id)}
                            ></Switch>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle>{t('tools')}</CardTitle>
                    <Button
                      type="button"
                      onClick={(evt) => {
                        setAddToolsDialogVisible(true)
                        evt.preventDefault()
                      }}
                    >
                      {t('add-tools')}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex"></div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                      {allNonCapabilities
                        .filter((t) => field.value.includes(t.id))
                        .map((p) => {
                          return (
                            <div
                              key={p.id}
                              className="flex flex-row items-center space-y-0 border p-3"
                            >
                              <div className="flex-1">
                                <div className="flex-1">{p.name}</div>
                              </div>
                              <Button
                                onClick={() => {
                                  if (p.visible) {
                                    form.setValue(
                                      'tools',
                                      withToolToggled(field.value, p.id, false)
                                    )
                                  }
                                }}
                                variant="ghost"
                              >
                                <IconX stroke="1"></IconX>
                              </Button>
                            </div>
                          )
                        })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          />
        </div>
      </ScrollArea>
      {isAddToolsDialogVisible && (
        <AddToolsDialog
          members={allNonCapabilities.filter((tool) => !form.getValues().tools.includes(tool.id))}
          onClose={() => setAddToolsDialogVisible(false)}
          onAddTools={(tools: dto.AssistantTool[]) => {
            const idsToEnable = tools.map((t) => t.id)
            const patched = [...form.getValues().tools, ...idsToEnable]
            form.setValue('tools', patched)
          }}
        />
      )}
    </>
  )
}

function withToolToggled(tools: string[], toolId: string, enabled: boolean): string[] {
  const patched = tools.slice().filter((t) => t !== toolId)
  if (enabled) {
    patched.push(toolId)
  }
  return patched
}
