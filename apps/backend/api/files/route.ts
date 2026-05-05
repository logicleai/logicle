import env from '@/lib/env'
import { forbidden, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { canAccess } from '@/backend/lib/files/authorization'
import { addFile } from '@/models/file'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const POST = operation({
  name: 'Create file',
  description: 'Create file metadata entry.',
  authentication: 'user',
  requestBodySchema: dto.insertableFileSchema,
  responses: [responseSpec(201, dto.fileSchema), errorSpec(400), errorSpec(403)] as const,
  implementation: async ({ body, session }) => {
    const id = nanoid()
    const path = `${id}-${body.name.replace(/(\W+)/gi, '-')}`
    const { owner, ...bodyWithoutOwner } = body
    if (!(await canAccess(session, owner.ownerType, owner.ownerId))) {
      return forbidden()
    }
    const created = await addFile(bodyWithoutOwner, path, env.fileStorage.encryptFiles, owner)
    return ok(
      {
        id: created.id,
        name: created.name,
        path: created.path,
        type: created.type,
        size: created.size ?? body.size,
        createdAt: created.createdAt,
        encrypted: created.encrypted ?? (env.fileStorage.encryptFiles ? 1 : 0),
      },
      201
    )
  },
})
