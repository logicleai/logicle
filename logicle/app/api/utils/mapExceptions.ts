import { defaultErrorResponse, interpretDbException } from '@/db/exception'
import { NextRequest } from 'next/server'

export function mapExceptions(func: (req: NextRequest, route: any) => Promise<Response>) {
  return async (req: NextRequest, params: object) => {
    try {
      return await func(req, params)
    } catch (e) {
      const interpretedException = interpretDbException(e)
      return defaultErrorResponse(interpretedException)
    }
  }
}
