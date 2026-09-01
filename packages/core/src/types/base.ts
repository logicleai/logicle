// `code`, when present, is the HTTP status the client-side fetch layer
// derived the error from; backend error bodies don't include it.
export type ApiError = {
  code?: number
  message: string
  values: { [key: string]: string }
}

export type ApiResponse<T = unknown> =
  | {
      data: T
      error: never
    }
  | {
      data: never
      error: ApiError
    }
