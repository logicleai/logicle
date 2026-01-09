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

export async function put<T>(
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

type NoJson = never | undefined

type ApiResponseFor<T> = T extends NoJson ? ApiResponse<null> : ApiResponse<T>

export async function fetchApiResponse(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<null>>
export async function fetchApiResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<T>>
export async function fetchApiResponse<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponseFor<T>> {
  const response = await fetch(input, init)

  if (response.ok) {
    if (response.status === 204) {
      return { data: null } as ApiResponseFor<T>
    }

    // Skip json() for never/undefined at the type level
    type ShouldParse = T extends NoJson ? false : true
    const shouldParse = true as ShouldParse

    return shouldParse
      ? ({ data: (await response.json()) as T } as ApiResponseFor<T>)
      : ({ data: null } as ApiResponseFor<T>)
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  let apiResponse: ApiResponseFor<T>
  if (isJson) {
    apiResponse = (await response.json()) as ApiResponseFor<T>
  } else {
    apiResponse = {
      error: {
        code: response.status,
        message: response.statusText,
        values: {},
      },
    } as ApiResponseFor<T>
  }
  return apiResponse
}
