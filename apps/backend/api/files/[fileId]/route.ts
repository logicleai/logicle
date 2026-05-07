import { db } from '@/db/database'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { forbidden, notFound, operation, responseSpec, errorSpec, ok } from '@/lib/routes'
import * as dto from '@/types/dto'

export const GET = operation({
  name: 'Get file details',
  description: 'Get file metadata and ownership information by file id.',
  authentication: 'user',
  responses: [responseSpec(200, dto.fileDetailsSchema), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    if (!(await canAccessFile({ userId: session.userId, userRole: session.userRole }, params.fileId))) {
      return forbidden()
    }

    const file = await db
      .selectFrom('File as F')
      .leftJoin('FileBlob as FB', 'FB.id', 'F.fileBlobId')
      .leftJoin('User as U', (join) =>
        join.onRef('U.id', '=', 'F.ownerId').on('F.ownerType', '=', 'USER')
      )
      .leftJoin('Conversation as C', (join) =>
        join.onRef('C.id', '=', 'F.ownerId').on('F.ownerType', '=', 'CHAT')
      )
      .leftJoin('Tool as T', (join) =>
        join.onRef('T.id', '=', 'F.ownerId').on('F.ownerType', '=', 'TOOL')
      )
      .select([
        'F.id',
        'F.name',
        'F.path',
        'F.type',
        'F.ownerType',
        'F.ownerId',
        'F.createdAt',
        'FB.id as blobId',
        'FB.size as blobSize',
        'FB.encrypted as blobEncrypted',
        'FB.contentHash as blobContentHash',
        'FB.createdAt as blobCreatedAt',
        'U.name as userOwnerName',
        'C.name as chatOwnerName',
        'T.name as toolOwnerName',
      ])
      .where('F.id', '=', params.fileId)
      .executeTakeFirst()

    if (!file) {
      return notFound()
    }

    const ownerName =
      file.ownerType === 'USER'
        ? (file.userOwnerName ?? null)
        : file.ownerType === 'CHAT'
        ? (file.chatOwnerName ?? null)
        : file.ownerType === 'TOOL'
        ? (file.toolOwnerName ?? null)
        : null

    return ok({
      id: file.id,
      name: file.name,
      path: file.path,
      type: file.type,
      createdAt: file.createdAt,
      owner: {
        ownerType: file.ownerType,
        ownerId: file.ownerId,
        ownerName,
      },
      blob:
        file.blobId && file.blobSize !== null && file.blobEncrypted !== null && file.blobContentHash
          ? {
              id: file.blobId,
              size: file.blobSize,
              encrypted: file.blobEncrypted,
              contentHash: file.blobContentHash,
              createdAt: file.blobCreatedAt ?? file.createdAt,
            }
          : null,
    })
  },
})
