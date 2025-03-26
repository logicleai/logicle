import { logger } from '@/lib/logging'
import ApiResponses from 'app/api/utils/ApiResponses'

export enum KnownDbErrorCode {
  DUPLICATE_KEY = 'duplicateKey',
  CONSTRAINT_NOT_NULL = 'constraintNotNull',
  CONSTRAINT_FOREIGN_KEY = 'constraintForeignKey',
}

export class KnownDbError extends Error {
  code: KnownDbErrorCode
  constructor(code: KnownDbErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const interpretDbException = (e: unknown): Error => {
  const { code } = e as { code: string }
  switch (code) {
    case '23505':
    case 'SQLITE_CONSTRAINT_UNIQUE':
      return new KnownDbError(KnownDbErrorCode.DUPLICATE_KEY, 'Duplicate Key')
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return new KnownDbError(KnownDbErrorCode.CONSTRAINT_NOT_NULL, 'Constraint not null')
    case '23503':
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return new KnownDbError(
        KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY,
        'Constraint not respected (foreign key)'
      )
  }
  return e as Error
}

export const defaultErrorResponse = (e: Error) => {
  if (e instanceof KnownDbError) {
    switch (e.code) {
      case KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY:
        return ApiResponses.foreignKey(e.message)
      case KnownDbErrorCode.DUPLICATE_KEY:
        return ApiResponses.conflict(e.message)
      case KnownDbErrorCode.CONSTRAINT_NOT_NULL:
        return ApiResponses.invalidParameter(e.message)
    }
  }
  logger.error(`Unexpected exception: ${e.message}`, e)
  return ApiResponses.internalServerError()
}
