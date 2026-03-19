type SameSite = 'lax' | 'strict' | 'none'

export type CookieOptions = {
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: SameSite
  secure?: boolean
}

export type CookieRecord = {
  name: string
  value: string
}

export type ResponseCookie = {
  name: string
  value: string
  options?: CookieOptions
}

export type CookieStoreLike = {
  get(name: string): CookieRecord | undefined
  set(name: string, value: string, options?: CookieOptions): void
  delete(name: string): void
}

export type MutableCookieStore = CookieStoreLike & {
  currentState: Map<string, string>
  modifications: ResponseCookie[]
}

export const parseCookieHeader = (cookieHeader: string | null) => {
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

export const serializeCookie = (name: string, value: string, options: CookieOptions = {}) => {
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

export const getCookieValue = (headers: Headers, name: string) => {
  return parseCookieHeader(headers.get('cookie')).get(name)
}

export const expireCookie = (name: string, options: CookieOptions = {}): ResponseCookie => ({
  name,
  value: '',
  options: {
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    ...options,
  },
})

export const createMutableCookieStore = (requestHeaders: Headers) => {
  const currentState = parseCookieHeader(requestHeaders.get('cookie'))
  const modifications: ResponseCookie[] = []

  const store: MutableCookieStore = {
    currentState,
    modifications,
    get(name: string) {
      const value = currentState.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set(name: string, value: string, options: CookieOptions = {}) {
      currentState.set(name, value)
      modifications.push({ name, value, options })
    },
    delete(name: string) {
      currentState.delete(name)
      modifications.push(expireCookie(name))
    },
  }

  return store
}

export const applyResponseCookies = (response: Response, cookies: ResponseCookie[] = []) => {
  if (cookies.length === 0) {
    return response
  }

  const headers = new Headers(response.headers)
  cookies.forEach((cookie) => {
    headers.append('set-cookie', serializeCookie(cookie.name, cookie.value, cookie.options))
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
