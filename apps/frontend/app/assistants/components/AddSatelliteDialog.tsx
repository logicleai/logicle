import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { ScrollableTable, column } from '@/components/ui/tables'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'

interface Props {
  onClose: () => void
  onAddSatellites: (satellites: dto.SatelliteListItem[]) => void
  candidates: dto.SatelliteListItem[]
}

export const AddSatelliteDialog = ({ onClose, onAddSatellites, candidates }: Props) => {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Map<string, dto.SatelliteListItem>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')

  const toggleSatellite = (satellite: dto.SatelliteListItem) => {
    const newMap = new Map(selection)
    if (!newMap.delete(satellite.id)) {
      newMap.set(satellite.id, satellite)
    }
    setSelection(newMap)
  }

  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const filtered =
    searchTerm.length === 0
      ? candidates
      : candidates.filter((s) => s.name.toLocaleLowerCase().includes(searchTermLowerCase))

  const columns = [
    column(t('table-column-name'), (s: dto.SatelliteListItem) => <span>{s.name}</span>),
    column(t('status'), (s: dto.SatelliteListItem) => (
      <span className={s.connected ? 'text-green-700' : 'text-muted-foreground'}>
        {s.connected ? t('connected') : t('disconnected')}
      </span>
    )),
    {
      name: t('table-column-selected'),
      renderer: (s: dto.SatelliteListItem) => (
        <div className="text-center">{selection.has(s.id) ? '✔' : ''}</div>
      ),
      headerClass: 'text-center',
    },
  ]

  async function onSubmit() {
    onAddSatellites(Array.from(selection.values()))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('select-satellites-to-add')}</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden">
          <SearchBarWithButtonsOnRight
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          />
          <ScrollableTable
            className="flex-1 text-body1 h-[24rem] table-auto"
            columns={columns}
            onRowClick={toggleSatellite}
            rows={filtered}
            keygen={(s) => s.id}
          />
        </div>
        <div className="flex justify-center">
          <Button onClick={() => onSubmit()}>{t('add')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
