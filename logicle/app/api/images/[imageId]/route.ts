import { db } from '@/db/database'
import { ensureABView } from '@/lib/utils'
import { operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const { GET } = route({
  GET: operation({
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
        return new NextResponse(null, { status: 404 })
      }
      return new NextResponse(ensureABView(data.data), {
        status: 200,
        headers: { 'content-type': data.mimeType },
      })
    },
  }),
})
