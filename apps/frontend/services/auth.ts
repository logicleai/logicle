import { get } from '@/lib/fetch'

interface CsrfTokenResponse {
  csrfToken: string
}

export const signinWithCredentials = async (email: string, password: string) => {
  return await signin('credentials', {
    email,
    password,
  })
}
export const signin = async (provider: string, body: Record<string, string>) => {
  const csrfTokenResponse = await get<CsrfTokenResponse>('/api/auth/csrf')
  const signInUrl = `/api/auth/callback/${provider}`
  const res = await fetch(`${signInUrl}`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Auth-Return-Redirect': '1',
    },
    body: new URLSearchParams({
      ...body,
      csrfToken: csrfTokenResponse.data.csrfToken,
    }),
  })
  return res
}
