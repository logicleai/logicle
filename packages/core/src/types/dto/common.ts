import { z } from 'zod'

export const iso8601UtcDateTimeSchema = z.iso.datetime({
  offset: false,
  local: false,
})
