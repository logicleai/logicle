import * as dto from '@/types/dto'
import { useTranslation } from 'next-i18next'
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WorkspaceSettingsDialog } from './WorkspaceSettingsDialog'
import { FormLabel } from '@/components/ui/form'
import { Prop, PropList } from '@/components/ui/proplist'

export const WorkspaceSettings = ({ workspace }: { workspace: dto.Workspace }) => {
  const { t } = useTranslation('common')
  const [editing, setEditing] = useState<boolean>(false)
  return (
    <Card className="text-body1 space-y-3 p-2">
      <PropList>
        <Prop label="Name">{workspace.name}</Prop>
        <Prop label="Slug">{workspace.slug}</Prop>
        <Prop label="Domain">{workspace.domain ?? '<unspecified>'}</Prop>
      </PropList>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <WorkspaceSettingsDialog
        workspace={workspace}
        opened={editing}
        onClose={() => setEditing(false)}
      ></WorkspaceSettingsDialog>
    </Card>
  )
}
