import { db } from '@/db/database'
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
  implementation: async ({ body, session }) => {
    const id = nanoid()
    const path = `${id}-${body.name.replace(/(\W+)/gi, '-')}`
    const { owner: bodyOwner, ...bodyWithoutOwner } = body
    const created = await addFile(bodyWithoutOwner, path, env.fileStorage.encryptFiles)
    const owner = bodyOwner ?? { ownerType: 'USER' as const, ownerId: session.userId }
    await db
      .insertInto('FileOwnership')
      .values({
        id: nanoid(),
        fileId: created.id,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        createdAt: new Date().toISOString(),
      })
      .execute()
    return ok(created, 201)
  },
})
