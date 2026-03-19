'use client'

import * as dto from '@/types/dto'

export type ToolFormFields = {
  name: string
  description: string
  tags: string[]
  promptFragment: string
  configuration: Record<string, unknown>
  files: dto.AssistantFile[]
}

export type ToolFormWithConfig<C> = Omit<ToolFormFields, 'configuration'> & {
  configuration: C
}
