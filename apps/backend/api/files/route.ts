import env from '@/lib/env'
import { ok, operation, responseSpec, route } from '@/lib/routes'
import { addFile } from '@/models/file'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const { POST } = route({
  POST: operation({
    name: 'Create file',
    description: 'Create file metadata entry.',
    authentication: 'user',
    requestBodySchema: dto.insertableFileSchema,
    responses: [responseSpec(201, dto.fileSchema)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      const id = nanoid()
      const file = requestBody
      const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
      const created = await addFile(file, path, env.fileStorage.encryptFiles)
      return ok(created, 201)
    },
  }),
})
