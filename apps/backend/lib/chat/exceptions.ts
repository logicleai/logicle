export class ClientException extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ToolSetupError extends Error {
  toolName: string

  constructor(toolName: string, message?: string) {
    super(message ?? `Failed setting up tool "${toolName}"`)
    this.name = 'ToolSetupError'
    this.toolName = toolName
  }
}

export class UserVisibleError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UserVisibleError'
  }
}
