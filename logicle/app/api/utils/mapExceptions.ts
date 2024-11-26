import { defaultErrorResponse, interpretDbException } from '@/db/exception'
import { NextRequest } from 'next/server'

export function mapExceptions<T extends Record<string, string>>(
  func: (req: NextRequest, route: T) => Promise<Response>
) {
  return async (req: NextRequest, route: { params: Promise<T> }) => {
    try {
      return await func(req, await route.params)
    } catch (e) {
      const interpretedException = interpretDbException(e)
      return defaultErrorResponse(interpretedException)
    }
  }
}
