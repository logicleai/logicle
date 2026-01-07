export enum KnownDbErrorCode {
  DUPLICATE_KEY = 'duplicateKey',
  CONSTRAINT_NOT_NULL = 'constraintNotNull',
  CONSTRAINT_FOREIGN_KEY = 'constraintForeignKey',
}

export const interpretDbException = (e: unknown): KnownDbErrorCode | undefined => {
  const { code } = e as { code: string }
  switch (code) {
    case '23505':
    case 'SQLITE_CONSTRAINT_UNIQUE':
      return KnownDbErrorCode.DUPLICATE_KEY
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return KnownDbErrorCode.CONSTRAINT_NOT_NULL
    case '23503':
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
  }
  return undefined
}
