import { db } from '@/db/database'
import { ensureABView } from '@/backend/lib/utils'
import { operation, responseSpec, errorSpec } from '@/lib/routes'
import { z } from 'zod'

export const GET = operation({
  name: 'Get image',
  description: 'Fetch an image by id.',
  authentication: 'user',
  responses: [responseSpec(200, z.any()), errorSpec(404)] as const,
  implementation: async (_req: Request, params: { imageId: string }) => {
    const data = await db
      .selectFrom('Image')
      .selectAll()
      .where('Image.id', '=', params.imageId)
      .executeTakeFirst()
    if (!data) {
      return new Response(null, { status: 404 })
    }
    return new Response(ensureABView(data.data), {
      status: 200,
      headers: { 'content-type': data.mimeType },
    })
  },
})
