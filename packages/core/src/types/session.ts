export type SimpleSession = {
  sessionId: string
  userId: string
}

export type AuthenticatedSession = SimpleSession & {
  userRole: string
}
