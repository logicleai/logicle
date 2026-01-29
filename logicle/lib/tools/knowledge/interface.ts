import * as z from 'zod'

export const KnowledgePluginSchema = z.object({}).strict()

export type KnowledgePluginParams = z.infer<typeof KnowledgePluginSchema>

export class KnowledgePluginInterface {
  static toolName: string = 'file-manager'
}
