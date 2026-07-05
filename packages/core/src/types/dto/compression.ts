/**
 * Types backing the deterministic context-compression planner
 * (see docs/context-compression.md).
 */

export interface CompressionFileRef {
  id: string
  name: string
  mimetype: string
  size: number
  origin: 'uploaded' | 'generated'
  sourceMessageId: string
}

export interface MessageCompressionDecision {
  messageId: string
  policy: 'full' | 'summary'
  reason: string
  estimatedTokensBefore: number
  estimatedTokensAfter: number
}
