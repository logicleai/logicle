import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import env from '@/lib/env'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ensureABView } from '@/lib/utils'
import { NextRequest } from 'next/server'

function contentTypeFromExt(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.txt':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(req: NextRequest, route: { params: Promise<{ path: string[] }> }) {
  const brandDir = env.provision.brand
  if (!brandDir) return ApiResponses.noSuchEntity('Brand directory not configured')
  const base = path.resolve(brandDir)
  const params = await route.params
  const filePath = path.resolve(base, params.path.join('/'))
  let data: Buffer
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(filePath)
    if (!stat.isFile()) return ApiResponses.noSuchEntity('Not found')
    data = await fs.readFile(filePath)
  } catch {
    return ApiResponses.internalServerError('Read error')
  }
  const ext = path.extname(filePath).toLowerCase()
  return new Response(ensureABView(data), {
    status: 200,
    headers: {
      'Content-Type': contentTypeFromExt(ext),
    },
  })
}
