import { CredentialsSignin } from 'next-auth'

export class InvalidCredentialsError extends CredentialsSignin {
  constructor(code: string) {
    super(code)
    this.code = code
  }
}
