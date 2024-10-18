import winston from 'winston'

// Create a Winston logger with a JSON format for structured logging
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json() // Output as structured JSON
  ),
  transports: [new winston.transports.Console()],
})
