import * as z from 'zod'

export type GoogleWebSearchParams = Record<string, unknown>

export class GoogleWebSearchInterface {
  static toolName: string = 'google.web_search'
}
