import * as dto from '@/types/dto'
import { DropArgument } from 'net'

export function protect(str: string) {
  const len = str.length
  const clearText = Math.min(12, Math.max(0, (len >> 1) - 4))
  const prefixLen = clearText >> 1
  const suffixLen = clearText - prefixLen
  const prefix = str.substring(0, prefixLen)
  const suffix = str.substring(len - suffixLen)
  return `${prefix}${'.'.repeat(Math.min(12, len - clearText))}${suffix}`
}

export function protectApiKey(backend: dto.Backend): dto.Backend {
  return {
    ...backend,
    apiKey: backend.apiKey == undefined ? undefined : protect(backend.apiKey),
  } as dto.Backend
}
