export type LiteLlmChatModelId = string

export interface LiteLlmChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
  */
  user?: string
}
