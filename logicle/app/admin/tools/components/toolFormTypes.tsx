'use client'

export type ToolFormFields = {
  name: string
  description: string
  tags: string[]
  promptFragment: string
  configuration: Record<string, unknown>
}

export type ToolFormWithConfig<C> = Omit<ToolFormFields, 'configuration'> & {
  configuration: C
}
