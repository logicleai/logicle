import { useTranslation } from 'react-i18next'
import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { ToolListSelector } from './ToolListSelector'

interface Props {
  onClose: () => void
  onAddTools: (tools: dto.AssistantTool[]) => void
  members: dto.AssistantTool[]
}

export const AddToolsDialog = ({ onClose, onAddTools, members }: Props) => {
  const { t } = useTranslation()
  const [selectedTools, setSelectedTools] = useState<dto.AssistantTool[]>([])
  async function onSubmit() {
    onAddTools(selectedTools)
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('select-tools-to-add')}</DialogTitle>
        </DialogHeader>
        <ToolListSelector tools={members} onSelectionChange={setSelectedTools}></ToolListSelector>
        <div className="flex justify-center">
          <Button onClick={() => onSubmit()}>{t('add')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
