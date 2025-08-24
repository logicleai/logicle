import { ApiResponse } from '@/types/base'

const defaultHeaders = {
  'Content-Type': 'application/json',
}

export async function get<T>(url: string): Promise<ApiResponse<T>> {
  return fetchApiResponse(url, {
    method: 'GET',
  })
}

export async function delete_<T>(url: RequestInfo | URL): Promise<ApiResponse<T>> {
  return fetchApiResponse(url, {
    method: 'DELETE',
  })
}

export async function put<T>(
  url: RequestInfo | URL,
  body: object | string
): Promise<ApiResponse<T>> {
  return fetchApiResponse(url, {
    method: 'PUT',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

export async function post<T>(url: RequestInfo | URL, body?: object): Promise<ApiResponse<T>> {
  return fetchApiResponse(url, {
    method: 'POST',
    headers: body !== undefined ? defaultHeaders : [],
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function patch<T>(url: RequestInfo | URL, body: object): Promise<ApiResponse<T>> {
  return fetchApiResponse(url, {
    method: 'PATCH',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

export async function fetchApiResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(input, init)
  if (response.ok) {
    return {
      data: (await response.json()) as T,
    } as ApiResponse<T>
  }
  const isJson = response.headers.get('content-type')?.includes('application/json')
  let apiResponse: ApiResponse<T>
  if (isJson) {
    apiResponse = (await response.json()) as ApiResponse<T>
  } else {
    apiResponse = {
      error: {
        code: response.status,
        message: response.statusText,
        values: {},
      },
    } as ApiResponse<T>
    if (response.status === 401) {
      const url = new URL(window.location.href)
      if (!url.pathname.startsWith('/auth')) {
        const redirectUrl = new URL(url.href)
        redirectUrl.pathname = '/auth/login'
        url.searchParams.set('callbackUrl ', encodeURI(url.href))
        window.open(url, '_self')
      }
    }
  }
  return apiResponse
}
