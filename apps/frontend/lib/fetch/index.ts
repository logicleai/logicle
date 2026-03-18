import { ApiResponse } from '@/types/base'

const defaultHeaders = {
  'Content-Type': 'application/json',
}

export async function get<T>(url: string): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'GET',
  })
}

export async function delete_<T = never>(url: RequestInfo | URL): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'DELETE',
  })
}

export async function put<T = never>(
  url: RequestInfo | URL,
  body: object | string
): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'PUT',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

export async function post<T>(url: RequestInfo | URL, body?: object): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'POST',
    headers: body !== undefined ? defaultHeaders : [],
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function patch<T = never>(
  url: RequestInfo | URL,
  body: object
): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'PATCH',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

export async function patchWithSignal<T = never>(
  url: RequestInfo | URL,
  body: object,
  signal: AbortSignal
): Promise<ApiResponse<T>> {
  return fetchApiResponse<T>(url, {
    method: 'PATCH',
    headers: defaultHeaders,
    body: JSON.stringify(body),
    signal,
  })
}

export async function fetchApiResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(input, init)
  const isJson = response.headers.get('content-type')?.includes('application/json')

  if (response.ok) {
    if (response.status === 204) {
      return { data: undefined } as ApiResponse<T>
    } else if (!isJson) {
      throw new Error('Expected application/json response')
    } else {
      return { data: (await response.json()) as T } as ApiResponse<T>
    }
  } else {
    if (isJson) {
      return (await response.json()) as ApiResponse<T>
    } else {
      return {
        error: {
          code: response.status,
          message: response.statusText,
          values: {},
        },
      } as ApiResponse<T>
    }
  }
}
