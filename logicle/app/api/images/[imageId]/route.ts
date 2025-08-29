import { requireSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'
import { ensureABView } from '@/lib/utils'
import { NextResponse } from 'next/server'

export const GET = requireSession(async (_session, _req, params: { imageId: string }) => {
  const data = await db
    .selectFrom('Image')
    .selectAll()
    .where('Image.id', '=', params.imageId)
    .executeTakeFirstOrThrow()
  return new NextResponse(ensureABView(data.data), { headers: { 'content-type': data.mimeType } })
})
