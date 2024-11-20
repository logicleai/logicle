import winston, { format } from 'winston'

const bufferToTruncatedStringArray = (buffer: Buffer, maxLen: number) => {
  const truncated = Array.from(buffer.subarray(0, maxLen)) as any[]
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
