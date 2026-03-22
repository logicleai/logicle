import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  default: {
    nextAuth: { secret: 'test-secret-for-user-secrets-tests!!' },
  },
}))

import {
  encryptUserSecret,
  decryptUserSecret,
  UserSecretError,
  UserSecretMissingKeyError,
  UserSecretUnreadableError,
} from '@/lib/userSecrets'
import { userSecretRequiredMessage, userSecretUnreadableMessage } from '@/lib/userSecretMessages'

describe('encryptUserSecret / decryptUserSecret', () => {
  test('round-trip preserves plaintext', () => {
    const plaintext = 'my-api-key-12345'
    const encrypted = encryptUserSecret(plaintext)
    expect(decryptUserSecret(encrypted)).toBe(plaintext)
  })

  test('encrypted format has 5 colon-separated parts', () => {
    const encrypted = encryptUserSecret('secret')
    expect(encrypted.split(':').length).toBe(5)
  })

  test('encrypted value starts with version prefix v1:', () => {
    expect(encryptUserSecret('secret').startsWith('v1:')).toBe(true)
  })

  test('two encryptions of the same value differ (random IV)', () => {
    const a = encryptUserSecret('same')
    const b = encryptUserSecret('same')
    expect(a).not.toBe(b)
  })

  test('round-trip works for empty string', () => {
    expect(decryptUserSecret(encryptUserSecret(''))).toBe('')
  })

  test('round-trip works for unicode plaintext', () => {
    const text = '🔑 secret café'
    expect(decryptUserSecret(encryptUserSecret(text))).toBe(text)
  })

  test('throws UserSecretUnreadableError for payload with fewer than 5 parts', () => {
    expect(() => decryptUserSecret('bad:payload')).toThrow(UserSecretUnreadableError)
  })

  test('throws UserSecretUnreadableError for payload with more than 5 parts', () => {
    expect(() => decryptUserSecret('a:b:c:d:e:f')).toThrow(UserSecretUnreadableError)
  })

  test('throws UserSecretUnreadableError for wrong version', () => {
    expect(() => decryptUserSecret('v2:a:b:c:d')).toThrow(UserSecretUnreadableError)
  })

  test('throws UserSecretUnreadableError for tampered ciphertext', () => {
    const encrypted = encryptUserSecret('original')
    const parts = encrypted.split(':')
    parts[3] = Buffer.from('tampered-garbage').toString('base64')
    expect(() => decryptUserSecret(parts.join(':'))).toThrow(UserSecretUnreadableError)
  })

  test('throws UserSecretUnreadableError for tampered auth tag', () => {
    const encrypted = encryptUserSecret('original')
    const parts = encrypted.split(':')
    parts[4] = Buffer.from('bad-tag').toString('base64')
    expect(() => decryptUserSecret(parts.join(':'))).toThrow(UserSecretUnreadableError)
  })
})

describe('UserSecretError hierarchy', () => {
  test('UserSecretMissingKeyError is a UserSecretError', () => {
    expect(new UserSecretMissingKeyError()).toBeInstanceOf(UserSecretError)
  })

  test('UserSecretUnreadableError is a UserSecretError', () => {
    expect(new UserSecretUnreadableError()).toBeInstanceOf(UserSecretError)
  })

  test('UserSecretMissingKeyError has correct name', () => {
    expect(new UserSecretMissingKeyError().name).toBe('UserSecretMissingKeyError')
  })

  test('UserSecretUnreadableError has correct name', () => {
    expect(new UserSecretUnreadableError().name).toBe('UserSecretUnreadableError')
  })

  test('default messages are set', () => {
    expect(new UserSecretMissingKeyError().message).toContain('Missing')
    expect(new UserSecretUnreadableError().message).toContain('unreadable')
  })
})

describe('userSecretRequiredMessage', () => {
  test('returns generic message when no backendName', () => {
    const msg = userSecretRequiredMessage()
    expect(msg).toContain('API key')
  })

  test('includes backendName when provided', () => {
    const msg = userSecretRequiredMessage('OpenAI')
    expect(msg).toContain('OpenAI')
    expect(msg).toContain('API key')
  })
})

describe('userSecretUnreadableMessage', () => {
  test('is a non-empty string', () => {
    expect(typeof userSecretUnreadableMessage).toBe('string')
    expect(userSecretUnreadableMessage.length).toBeGreaterThan(0)
  })
})
