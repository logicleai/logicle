import ApiResponses from 'app/api/utils/ApiResponses'

export enum KnownDbErrorCode {
  CANT_UPDATE_DELETE_FOREIGN_KEY = 'foreignKey',
  DUPLICATE_KEY = 'duplicateKey',
  CONSTRAINT_NOT_NULL = 'constraintNotNull',
  CONSTRAINT_FOREIGN_KEY = 'constraintForeignKey',
}

export class KnownDbError extends Error {
  code: KnownDbErrorCode
  constructor(code: KnownDbErrorCode, message: string) {
    super(message, {
      cause: 22,
    })
    this.code = code
  }
}

export const interpretDbException = (e: any): Error => {
  const { code } = e as any
  switch (code) {
    case '23503':
      return new KnownDbError(
        KnownDbErrorCode.CANT_UPDATE_DELETE_FOREIGN_KEY,
        'Foreign key violation'
      )
    case '23505':
      return new KnownDbError(KnownDbErrorCode.DUPLICATE_KEY, 'Duplicate Key')
    case 'SQLITE_CONSTRAINT_UNIQUE':
      return new KnownDbError(KnownDbErrorCode.DUPLICATE_KEY, 'Duplicate Key')
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return new KnownDbError(KnownDbErrorCode.CONSTRAINT_NOT_NULL, 'Constraint not null')
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return new KnownDbError(
        KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY,
        'Constraint not respected (foreign key)'
      )
  }
  return e
}

export const defaultErrorResponse = (e: Error) => {
  if (e instanceof KnownDbError) {
    switch (e.code) {
      case KnownDbErrorCode.CANT_UPDATE_DELETE_FOREIGN_KEY:
        return ApiResponses.foreignKey(e.message)
      case KnownDbErrorCode.DUPLICATE_KEY:
        return ApiResponses.conflict(e.message)
      case KnownDbErrorCode.CONSTRAINT_NOT_NULL:
        return ApiResponses.invalidParameter(e.message)
    }
  }
  console.log(`Unexpected exception: ${e}`)
  return ApiResponses.internalServerError()
}
