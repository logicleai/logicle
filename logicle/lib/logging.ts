import winston, { format } from 'winston'

const bufferToTruncatedStringArray = (buffer: Buffer, maxLen: number) => {
  const truncated = Array.from(buffer.subarray(0, maxLen)) as unknown[]
  if (buffer.length >= maxLen) {
    truncated[truncated.length - 1] = '...'
  }
  return truncated
}

const truncateFormat = format((info) => {
  const maxLength = info.level == 'error' ? 1000 : 100 // Max length for log messages
  for (const key in info) {
    const value = info[key]
    if (typeof value === 'string' && value.length > maxLength) {
      info[key] = value.substring(0, maxLength) + '...'
    } else if (Buffer.isBuffer(value)) {
      info[key] = bufferToTruncatedStringArray(value, maxLength / 4)
    }
  }
  return info
})

// Create a Winston logger with a JSON format for structured logging
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    truncateFormat(),
    winston.format.timestamp(),
    winston.format.json() // Output as structured JSON
  ),
  transports: [new winston.transports.Console()],
})

export function sanitizeAndTransform(input: unknown, maxStringLength = 50): unknown {
  const isBinary = (val: any): val is Buffer | ArrayBuffer | Uint8Array =>
    Buffer.isBuffer(val) || val instanceof ArrayBuffer || ArrayBuffer.isView(val)

  const transformBinary = (val: Buffer | ArrayBuffer | Uint8Array): string => {
    const buf = Buffer.isBuffer(val)
      ? val
      : val instanceof ArrayBuffer
      ? Buffer.from(val)
      : Buffer.from(val.buffer, val.byteOffset, val.byteLength)
    return buf.toString('base64')
  }

  const recurse = (value: unknown, seen = new WeakSet()): unknown => {
    if (typeof value === 'string') {
      return value.length > maxStringLength ? value.slice(0, maxStringLength) : value
    }
    if (isBinary(value)) return transformBinary(value)
    if (Array.isArray(value)) return value.map((v) => recurse(v, seen))
    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return undefined
      seen.add(value as object)
      const obj = value as Record<string, unknown>
      return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = recurse(v, seen)
        return acc
      }, {})
    }
    return value
  }

  return recurse(input)
}

export function smartStringify(input: unknown, maxStringLength = 50): string {
  const cache = new WeakSet<object>()

  const replacer = (_: string, value: unknown): unknown => {
    if (typeof value === 'string') {
      return typeof maxStringLength === 'number' && value.length > maxStringLength
        ? value.slice(0, maxStringLength)
        : value
    }
    if (Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return sanitizeAndTransform(value, maxStringLength)
    }
    if (value && typeof value === 'object') {
      if (cache.has(value)) return undefined
      cache.add(value)
    }
    return value
  }

  return JSON.stringify(input, replacer)
}
