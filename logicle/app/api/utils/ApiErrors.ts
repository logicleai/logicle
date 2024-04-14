import { NextResponse } from 'next/server'

export default class ApiErrors {
  static error(status: number, msg: string, values?: object | undefined) {
    return NextResponse.json(
      {
        error: {
          message: msg,
          values: values ?? {},
        },
      },
      { status: status }
    )
  }
  static noSuchEntity(msg?: string) {
    return ApiErrors.error(404, msg ?? 'Requested data is not available')
  }

  static invalidParameter(msg?: string) {
    return ApiErrors.error(404, msg ?? 'Invalid parameter')
  }

  static mismatchBetweenPathAndPayload() {
    return ApiErrors.error(400, 'The data provided is not consistent with the path. Check the IDs')
  }

  static forbiddenAction(msg?: string) {
    return ApiErrors.error(403, msg ?? 'You are not authorized')
  }

  static foreignKey(msg: string) {
    return ApiErrors.error(409, msg)
  }

  static createConflict(msg?: string) {
    return ApiErrors.error(409, msg ?? "Can't create due to conflict")
  }

  static internalServerError(msg?: string) {
    return ApiErrors.error(500, msg ?? 'Internal server error')
  }

  static notImplemented(msg?: string) {
    return ApiErrors.error(501, msg ?? 'Not Implemented')
  }

  static notAuthorized(msg?: string) {
    return ApiErrors.error(401, msg ?? 'Not authorized')
  }
}
