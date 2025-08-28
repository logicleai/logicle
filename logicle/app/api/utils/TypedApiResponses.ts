import { TypedNextResponse } from 'next-rest-framework'
import { NextResponse } from 'next/server'

export default class TypedApiResponses {
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

  static error<S extends number>(status: S, msg: string, values?: object | undefined) {
    return TypedNextResponse.json<
      { error: { message: string; values: object } },
      S,
      'application/json'
    >(
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
    return TypedApiResponses.error(404, msg ?? 'Requested data is not available')
  }

  static invalidParameter(msg?: string, values?: object) {
    return TypedApiResponses.error(400, msg ?? 'Invalid parameter', values)
  }

  static forbiddenAction(msg?: string) {
    return TypedApiResponses.error(403, msg ?? 'You are not authorized')
  }

  static foreignKey(msg: string) {
    return TypedApiResponses.error(409, msg)
  }

  static conflict(msg?: string) {
    return TypedApiResponses.error(409, msg ?? "Can't create due to conflict")
  }

  static internalServerError(msg?: string) {
    return TypedApiResponses.error(500, msg ?? 'Internal server error')
  }

  static notImplemented(msg?: string) {
    return TypedApiResponses.error(501, msg ?? 'Not Implemented')
  }

  static notAuthorized(msg?: string) {
    return TypedApiResponses.error(401, msg ?? 'Not authorized')
  }
}
