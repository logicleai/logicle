import { db } from '@/db/database'
import { ok, operation, responseSpec } from '@/lib/routes'
import { z } from 'zod'

const userImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
  createdAt: z.string(),
})

export const GET = operation({
  name: 'List user images',
  description: 'List image files accessible from user-owned file contexts.',
  authentication: 'user',
  responses: [responseSpec(200, z.array(userImageSchema))] as const,
  implementation: async ({ session }) => {
    const rows = await db
      .selectFrom('File as F')
      .innerJoin('FileBlob as FB', 'FB.id', 'F.fileBlobId')
      .leftJoin('Conversation as C', 'C.id', 'F.ownerId')
      .select(['F.id', 'F.name', 'F.type', 'FB.size as size', 'F.createdAt'])
      .where('F.fileBlobId', 'is not', null)
      .where('F.type', 'like', 'image/%')
      .where((eb) =>
        eb.or([
          eb.and([eb('F.ownerType', '=', 'USER'), eb('F.ownerId', '=', session.userId)]),
          eb.and([eb('F.ownerType', '=', 'CHAT'), eb('C.ownerId', '=', session.userId)]),
        ])
      )
      .distinct()
      .orderBy('F.createdAt', 'desc')
      .execute()

    return ok(rows)
  },
})
