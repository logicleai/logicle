import { createHash } from 'node:crypto'
import type { ToolFunctions } from '@/lib/chat/tools'

const MAX_TOOL_FUNCTION_NAME_LENGTH = 64
const SEPARATOR = '__'
// Each segment is capped so that tool__function always fits within MAX_TOOL_FUNCTION_NAME_LENGTH.
const MAX_SEGMENT_LENGTH = Math.floor((MAX_TOOL_FUNCTION_NAME_LENGTH - SEPARATOR.length) / 2) // 31
const HASH_LENGTH = 8

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, HASH_LENGTH)

export const sanitizeToolFunctionNameSegment = (value: string, fallback: string): string => {
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const sanitized = ascii
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return sanitized || fallback
}

const truncateSegment = (segment: string, identity: string): string => {
  if (segment.length <= MAX_SEGMENT_LENGTH) return segment
  const suffix = `_${hash(identity)}`
  return `${segment.slice(0, MAX_SEGMENT_LENGTH - suffix.length)}${suffix}`
}

const addHashSuffix = (name: string, identity: string): string => {
  const suffix = `_${hash(identity)}`
  return `${name.slice(0, MAX_TOOL_FUNCTION_NAME_LENGTH - suffix.length)}${suffix}`
}

export const prefixedToolFunctionName = (toolName: string, functionName: string): string => {
  const toolSegment = truncateSegment(sanitizeToolFunctionNameSegment(toolName, 'tool'), toolName)
  const fnSegment = truncateSegment(
    sanitizeToolFunctionNameSegment(functionName, 'function'),
    functionName
  )
  return `${toolSegment}${SEPARATOR}${fnSegment}`
}

export const prefixToolFunctionNames = (
  functions: ToolFunctions,
  toolName: string,
  usedNames: Set<string>
): ToolFunctions => {
  return Object.fromEntries(
    Object.entries(functions).map(([functionName, definition]) => {
      if (definition.type === 'provider') {
        usedNames.add(functionName)
        return [functionName, definition]
      }

      let exposedName = prefixedToolFunctionName(toolName, functionName)
      let attempt = 0
      while (usedNames.has(exposedName)) {
        attempt += 1
        exposedName = addHashSuffix(exposedName, `${toolName}:${functionName}:${attempt}`)
      }
      usedNames.add(exposedName)
      return [exposedName, definition]
    })
  )
}
