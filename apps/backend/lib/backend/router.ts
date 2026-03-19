import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { backendRouteModules } from '@/lib/backend/routes'

type RouteModule = Record<string, unknown>

type RouteEntry = {
  pathname: string
  load: () => Promise<RouteModule>
  regex: RegExp
  params: Array<{ name: string; catchAll: boolean }>
  score: number
}

type RouteMatch = {
  entry: RouteEntry
  params: Record<string, string | string[]>
}

const supportedMethods = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'] as const

const toNodeRequestUrl = (req: IncomingMessage) => {
  const host = req.headers.host ?? 'localhost'
  const protocol =
    (Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : req.headers['x-forwarded-proto']) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http')
  return new URL(req.url ?? '/', `${protocol}://${host}`)
}

const toWebRequest = (req: IncomingMessage) => {
  const url = toNodeRequestUrl(req)
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
      continue
    }
    headers.set(key, value)
  }

  return new Request(url, {
    method: req.method,
    headers,
    body:
      req.method === 'GET' || req.method === 'HEAD' || req.method === undefined
        ? undefined
        : (Readable.toWeb(req) as ReadableStream),
    duplex: 'half',
  } as RequestInit)
}

const compileRoute = (pathname: string): RouteEntry => {
  const params: Array<{ name: string; catchAll: boolean }> = []
  const segments = pathname.split('/').filter(Boolean)
  let score = 0

  const pattern = segments
    .map((segment) => {
      if (segment.startsWith('[...') && segment.endsWith(']')) {
        const name = segment.slice(4, -1)
        params.push({ name, catchAll: true })
        score += 1
        return '(.+)'
      }
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const name = segment.slice(1, -1)
        params.push({ name, catchAll: false })
        score += 5
        return '([^/]+)'
      }

      score += 10
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')

  const routeModule = backendRouteModules.find((entry) => entry.pathname === pathname)!

  return {
    pathname,
    load: routeModule.load,
    regex: new RegExp(`^/${pattern}$`),
    params,
    score,
  }
}

const compiledRoutes = [...backendRouteModules]
  .map((entry) => compileRoute(entry.pathname))
  .sort((a, b) => b.score - a.score || b.pathname.length - a.pathname.length)

const matchRoute = (pathname: string): RouteMatch | null => {
  for (const entry of compiledRoutes) {
    const match = entry.regex.exec(pathname)
    if (!match) {
      continue
    }

    const params: Record<string, string | string[]> = {}
    entry.params.forEach((param, index) => {
      const value = decodeURIComponent(match[index + 1] ?? '')
      params[param.name] = param.catchAll ? value.split('/').filter(Boolean) : value
    })

    return { entry, params }
  }

  return null
}

const loadRouteModule = async (entry: RouteEntry): Promise<RouteModule> => {
  return await entry.load()
}

const methodNotAllowedForModule = (routeModule: RouteModule) => {
  const allow = supportedMethods.filter((method) => typeof routeModule[method] === 'function')
  return new Response(null, {
    status: 405,
    headers: allow.length > 0 ? { allow: allow.join(', ') } : undefined,
  })
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const request = toWebRequest(req)
  const url = new URL(request.url)
  const match = matchRoute(url.pathname)

  if (!match) {
    return false
  }

  const method = request.method.toUpperCase()
  const routeModule = await loadRouteModule(match.entry)
  const handler = routeModule[method]

  if (typeof handler !== 'function') {
    await sendWebResponse(res, methodNotAllowedForModule(routeModule))
    return true
  }

  const response = await (
    handler as (request: Request, context: { params: Promise<any> }) => Promise<Response>
  )(request, {
    params: Promise.resolve(match.params),
  })

  await sendWebResponse(res, response)
  return true
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  res.statusMessage = response.statusText

  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []

  if (setCookieHeaders.length > 0) {
    res.setHeader('set-cookie', setCookieHeaders)
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return
    }
    res.setHeader(key, value)
  })

  if (!response.body) {
    res.end()
    return
  }

  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  await new Promise<void>((resolve, reject) => {
    body.on('error', reject)
    res.on('error', reject)
    res.on('finish', resolve)
    body.pipe(res)
  })
}
