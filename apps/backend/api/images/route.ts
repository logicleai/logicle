import env from '@/lib/env'
import { ok, operation, responseSpec } from '@/lib/routes'
import { addAssistantFile } from '@/models/assistant'
import { addFile } from '@/models/file'
import { insertableFileSchema } from '@/types/dto/file'
import { nanoid } from 'nanoid'
import { z } from 'zod'

export const POST = operation({
  name: 'Upload image metadata',
  description: 'Create an image file entry and optionally associate with an assistant.',
  authentication: 'user',
  requestBodySchema: insertableFileSchema,
  querySchema: z.object({
    assistantId: z.string().optional(),
  }),
  responses: [responseSpec(201)] as const,
  implementation: async ({ requestBody, query }) => {
    const id = nanoid()
    const file = requestBody
    const assistantId = query.assistantId ?? ''
    const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
    const created = await addFile(file, path, env.fileStorage.encryptFiles)
    if (assistantId) {
      await addAssistantFile(assistantId, created)
    }
    return ok(created, 201)
  },
})
