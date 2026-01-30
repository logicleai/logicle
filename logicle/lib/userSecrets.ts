import crypto from 'node:crypto'
import env from '@/lib/env'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BYTES = 32
const PBKDF2_ROUNDS = 120_000

export class UserSecretError extends Error {}

export class UserSecretUnreadableError extends UserSecretError {
  constructor(message = 'User secret is unreadable') {
    super(message)
    this.name = 'UserSecretUnreadableError'
  }
}

export class UserSecretMissingKeyError extends UserSecretError {
  constructor(message = 'Missing encryption secret') {
    super(message)
    this.name = 'UserSecretMissingKeyError'
  }
}

const requireEncryptionSecret = () => {
  if (!env.nextAuth.secret) {
    throw new UserSecretMissingKeyError('Missing NEXTAUTH_SECRET for user secret encryption')
  }
  return env.nextAuth.secret
}

const deriveKey = (secret: string, salt: Buffer) => {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ROUNDS, KEY_BYTES, 'sha256')
}

export const encryptUserSecret = (plaintext: string) => {
  const secret = requireEncryptionSecret()
  const salt = crypto.randomBytes(SALT_BYTES)
  const iv = crypto.randomBytes(IV_BYTES)
  const key = deriveKey(secret, salt)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    salt.toString('base64'),
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':')
}

export const decryptUserSecret = (payload: string) => {
  const secret = requireEncryptionSecret()
  const parts = payload.split(':')
  if (parts.length !== 5) {
    throw new UserSecretUnreadableError('Malformed user secret payload')
  }
  const [version, saltB64, ivB64, ciphertextB64, tagB64] = parts
  if (version !== VERSION) {
    throw new UserSecretUnreadableError('Unsupported user secret payload version')
  }
  try {
    const salt = Buffer.from(saltB64, 'base64')
    const iv = Buffer.from(ivB64, 'base64')
    const ciphertext = Buffer.from(ciphertextB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const key = deriveKey(secret, salt)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch (error) {
    throw new UserSecretUnreadableError(
      error instanceof Error ? error.message : 'Failed to decrypt user secret'
    )
  }
}

export const userSecretRequiredMessage = (backendName?: string) => {
  if (backendName) {
    return `Backend "${backendName}" requires your API key. Add it in Settings > API Keys.`
  }
  return 'This backend requires your API key. Add it in Settings > API Keys.'
}

export const userSecretUnreadableMessage =
  'Your saved API key could not be decrypted. Please re-enter it in Settings > API Keys.'
