export const userSecretRequiredMessage = (backendName?: string) => {
  if (backendName) {
    return `Backend "${backendName}" requires your API key. Add it in Settings > API Keys.`
  }
  return 'This backend requires your API key. Add it in Settings > API Keys.'
}

export const userSecretUnreadableMessage =
  'Your saved API key could not be decrypted. Please re-enter it in Settings > API Keys.'
