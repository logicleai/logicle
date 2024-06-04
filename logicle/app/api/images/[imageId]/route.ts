import { requireSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'

export const GET = requireSession(async (session, req, route: { params: { imageId: string } }) => {
  const data = await db
    .selectFrom('Image')
    .selectAll()
    .where('Image.id', '=', route.params.imageId)
    .executeTakeFirstOrThrow()
  // after
  return new Response(data.data, { headers: { 'content-type': data.mimeType } })
})
