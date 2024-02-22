export type ApiError = {
  code?: string
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

export type Role = 'owner' | 'member'
