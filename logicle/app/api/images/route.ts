import env from '@/lib/env'
import { ok, operation, responseSpec, route } from '@/lib/routes'
import { addAssistantFile } from '@/models/assistant'
import { addFile } from '@/models/file'
import { insertableFileSchema } from '@/types/dto/file'
import { nanoid } from 'nanoid'

export const { POST } = route({
  POST: operation({
    name: 'Upload image metadata',
    description: 'Create an image file entry and optionally associate with an assistant.',
    authentication: 'user',
    requestBodySchema: insertableFileSchema,
    responses: [responseSpec(201)] as const,
    implementation: async (req: Request, _params, { requestBody }) => {
      const id = nanoid()
      const file = requestBody
      const url = new URL(req.url)
      const assistantId = url.searchParams.get('assistantId') ?? ''
      const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
      const created = await addFile(file, path, env.fileStorage.encryptFiles)
      if (assistantId) {
        await addAssistantFile(assistantId, created)
      }
      return ok(created, 201)
    },
  }),
})
