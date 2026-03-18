import { AsyncLocalStorage } from 'node:async_hooks'

type SameSite = 'lax' | 'strict' | 'none'

type CookieOptions = {
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: SameSite
  secure?: boolean
}

type CookieRecord = {
  name: string
  value: string
}

type CookieStoreLike = {
  get(name: string): CookieRecord | undefined
  set(name: string, value: string, options?: CookieOptions): void
  delete(name: string): void
}

type RequestContext = {
  cookieStore: CookieStoreLike
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>()

const parseCookieHeader = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>()
  if (!cookieHeader) {
    return cookies
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }
    const name = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (!name) {
      continue
    }
    cookies.set(name, decodeURIComponent(value))
  }

  return cookies
}

const serializeCookie = (name: string, value: string, options: CookieOptions = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.path) {
    parts.push(`Path=${options.path}`)
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  }
  if (options.httpOnly) {
    parts.push('HttpOnly')
  }
  if (options.secure) {
    parts.push('Secure')
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
  }

  return parts.join('; ')
}

const createCookieStore = (request: Request, responseHeaders: Headers): CookieStoreLike => {
  const cookies = parseCookieHeader(request.headers.get('cookie'))

  return {
    get(name: string) {
      const value = cookies.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set(name: string, value: string, options: CookieOptions = {}) {
      cookies.set(name, value)
      responseHeaders.append('set-cookie', serializeCookie(name, value, options))
    },
    delete(name: string) {
      cookies.delete(name)
      responseHeaders.append(
        'set-cookie',
        serializeCookie(name, '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0,
        })
      )
    },
  }
}

export async function runWithRequestContext<T>(
  request: Request,
  responseHeaders: Headers,
  fn: () => Promise<T>
) {
  const cookieStore = createCookieStore(request, responseHeaders)
  return await requestContextStorage.run({ cookieStore }, fn)
}

export async function getCookieStore() {
  const requestContext = requestContextStorage.getStore()
  if (requestContext) {
    return requestContext.cookieStore
  }

  const nextHeaders = await import('next/headers')
  return await nextHeaders.cookies()
}
