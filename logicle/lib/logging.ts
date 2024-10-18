import winston, { format } from 'winston'

const truncateFormat = format((info) => {
  const maxLength = 100 // Max length for log messages
  for (let key in info) {
    if (info.hasOwnProperty(key)) {
      const value = info[key]
      if (typeof value === 'string' && value.length > maxLength) {
        info[key] = value.substring(0, maxLength) + '...'
      }
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
