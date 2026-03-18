import * as z from 'zod'

export const FileManagerPluginSchema = z.object({}).strict()

export type FileManagerPluginParams = z.infer<typeof FileManagerPluginSchema>

export class FileManagerPluginInterface {
  static toolName: string = 'file-manager'
}
