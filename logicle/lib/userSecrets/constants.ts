export const USER_PROVIDED_API_KEY = 'user_provided'
export const USER_SECRET_TYPE = 'backend-credentials' as const
export type UserSecretType = typeof USER_SECRET_TYPE

export const isUserProvidedApiKey = (apiKey?: string | null) => apiKey === USER_PROVIDED_API_KEY
