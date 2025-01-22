export class ClientException extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

// Th
export class ClientGoneException extends ClientException {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}
