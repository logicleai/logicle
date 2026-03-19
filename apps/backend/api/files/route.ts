import env from '@/lib/env'
import { ok, operation, responseSpec } from '@/lib/routes'
import { addFile } from '@/models/file'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const POST = operation({
  name: 'Create file',
  description: 'Create file metadata entry.',
  authentication: 'user',
  requestBodySchema: dto.insertableFileSchema,
  responses: [responseSpec(201, dto.fileSchema)] as const,
  implementation: async ({ body }) => {
    const id = nanoid()
    const file = body
    const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
    const created = await addFile(file, path, env.fileStorage.encryptFiles)
    return ok(created, 201)
  },
})
