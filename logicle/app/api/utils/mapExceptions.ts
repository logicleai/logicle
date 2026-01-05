import { defaultErrorResponse, interpretDbException } from '@/db/exception'

export function mapExceptions<T extends Record<string, string>>(
  func: (req: Request, route: T) => Promise<Response>
) {
  return async (req: Request, route: { params: Promise<T> }) => {
    try {
      return await func(req, await route.params)
    } catch (e) {
      const interpretedException = interpretDbException(e)
      return defaultErrorResponse(interpretedException)
    }
  }
}
