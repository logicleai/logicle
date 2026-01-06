import { db } from '@/db/database'
import { ensureABView } from '@/lib/utils'
import { route, operation } from '@/lib/routes'
import { NextResponse } from 'next/server'

export const { GET } = route({
  GET: operation({
    name: 'Get image',
    description: 'Fetch an image by id.',
    authentication: 'user',
    implementation: async (_req: Request, params: { imageId: string }) => {
      const data = await db
        .selectFrom('Image')
        .selectAll()
        .where('Image.id', '=', params.imageId)
        .executeTakeFirstOrThrow()
      return new NextResponse(ensureABView(data.data), {
        headers: { 'content-type': data.mimeType },
      })
    },
  }),
})
