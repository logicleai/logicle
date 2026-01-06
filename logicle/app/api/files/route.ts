import ApiResponses from '@/api/utils/ApiResponses'
import env from '@/lib/env'
import { route, operation } from '@/lib/routes'
import { addFile } from '@/models/file'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const { POST } = route({
  POST: operation({
    name: 'Create file',
    description: 'Create file metadata entry.',
    authentication: 'user',
    requestBodySchema: dto.insertableFileSchema,
    implementation: async (_req: Request, _params, { requestBody }) => {
      const id = nanoid()
      const file = requestBody
      const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
      const created = await addFile(file, path, env.fileStorage.encryptFiles)
      return ApiResponses.created(created)
    },
  }),
})
