import { NextResponse } from 'next/server'

export default class ApiResponses {
  static json(data: object) {
    return NextResponse.json(data)
  }

  static created(data: object) {
    return NextResponse.json(data, { status: 201 })
  }

  static success() {
    return NextResponse.json({
      success: true,
    })
  }

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
    return ApiResponses.error(404, msg ?? 'Requested data is not available')
  }

  static invalidParameter(msg?: string) {
    return ApiResponses.error(404, msg ?? 'Invalid parameter')
  }

  static mismatchBetweenPathAndPayload() {
    return ApiResponses.error(
      400,
      'The data provided is not consistent with the path. Check the IDs'
    )
  }

  static forbiddenAction(msg?: string) {
    return ApiResponses.error(403, msg ?? 'You are not authorized')
  }

  static foreignKey(msg: string) {
    return ApiResponses.error(409, msg)
  }

  static conflict(msg?: string) {
    return ApiResponses.error(409, msg ?? "Can't create due to conflict")
  }

  static internalServerError(msg?: string) {
    return ApiResponses.error(500, msg ?? 'Internal server error')
  }

  static notImplemented(msg?: string) {
    return ApiResponses.error(501, msg ?? 'Not Implemented')
  }

  static notAuthorized(msg?: string) {
    return ApiResponses.error(401, msg ?? 'Not authorized')
  }
}
