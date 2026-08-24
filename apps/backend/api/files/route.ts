
import { ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { addFile } from '@/models/file'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { getConfiguredFileEncryption } from '@/lib/storage/encryption'

export const POST = operation({
  name: 'Create file',
  description: 'Create file metadata entry.',
  authentication: 'user',
  requestBodySchema: dto.insertableFileSchema,
  responses: [responseSpec(201, dto.fileSchema), errorSpec(400)] as const,
  implementation: async ({ body, session }) => {
    const id = nanoid()
    const path = `${id}-${body.name.replace(/(\W+)/gi, '-')}`
    // Uploads always create the File row as USER-owned by the uploader — the client-supplied
    // `owner` is ignored. Ownership transfers to its final owner (CHAT/ASSISTANT/TOOL) happens
    // server-side afterward, as a side effect of saving the entity the file is attached to.
    const { owner: _clientSuppliedOwner, ...bodyWithoutOwner } = body
    const owner: dto.FileOwner = { ownerType: 'USER', ownerId: session.userId }
    const fileEncryption = getConfiguredFileEncryption()
    const created = await addFile(bodyWithoutOwner, path, fileEncryption, owner)
    return ok(
      {
        id: created.id,
        name: created.name,
        path: created.path,
        type: created.type,
        size: created.size ?? body.size,
        createdAt: created.createdAt,
        encryption: created.encryption ?? fileEncryption,
      },
      201
    )
  },
})
