// lib/auth/runStrategy.ts
import { NextRequest } from 'next/server'
import type { Strategy } from 'passport'

export async function runPassportStrategy(
  strategy: Strategy,
  req: NextRequest,
  options?: any,
  body?: Record<string, any>
) {
  // URL query params (?foo=bar)
  const query: Record<string, any> = Object.fromEntries(req.nextUrl.searchParams.entries())

  return new Promise<{ user: any; redirect?: string }>((resolve, reject) => {
    const _req: any = {
      url: (req as any).url ?? req.nextUrl.toString(),
      method: req.method,
      headers: Object.fromEntries(req.headers),
      query,
      body,
    }

    const _res: any = {}

    _res.redirect = (url: string) => {
      resolve({ user: null, redirect: url })
    }

    strategy.success = (user: any) => {
      resolve({ user })
    }

    strategy.fail = (info: any) => {
      reject(new Error(info?.message || 'Authentication failed'))
    }

    strategy.error = (err: Error) => {
      reject(err)
    }

    strategy.redirect = (url: string) => {
      resolve({ user: null, redirect: url })
    }

    const authOptions = options ?? {}
    ;(strategy as any).authenticate(_req, authOptions)
  })
}
