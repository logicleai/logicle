import env from '@/lib/env'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ensureABView } from '@/lib/utils'
import { NextResponse } from 'next/server'

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

export async function GET(_req: Request, route: { params: Promise<{ path: string[] }> }) {
  const brandDir = env.provision.brand
  if (!brandDir) {
    return NextResponse.json(
      { error: { message: 'Brand directory not configured', values: {} } },
      { status: 404 }
    )
  }
  const base = path.resolve(brandDir)
  const params = await route.params
  const filePath = path.resolve(base, params.path.join('/'))
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return NextResponse.json({ error: { message: 'Not found', values: {} } }, { status: 404 })
    }
    const data = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    return new Response(ensureABView(data), {
      status: 200,
      headers: {
        'Content-Type': contentTypeFromExt(ext),
      },
    })
  } catch {
    return NextResponse.json({ error: { message: 'Read error', values: {} } }, { status: 500 })
  }
}
